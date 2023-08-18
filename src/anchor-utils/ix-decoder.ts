import borsh from "@coral-xyz/borsh";
import { Layout } from "buffer-layout";
import camelCase from "camelcase";
import { snakeCase } from "snake-case";
import * as sha256 from "fast-sha256";
import bs58 from "bs58";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { Idl, IdlAccountItem, IdlAccounts, IdlField, IdlStateMethod } from "./idl.js";
import IdlCoder from "./coder/borsh/idl.js";
import logger from "../loader/log.js";
import { AccountData, DecodedInstruction, Instruction } from "../types/instruction.js";
import { convertArrayObjectValuesToNumber, convertObjectValuesToNumber } from "../utils/recursiveStringifier.js";

// For now we just manually add the file path
// TODO: Host the idl files somewhere else and call from that url
// TODO: Call the IDL from Anchor directly instead of manually adding the file path

/**
 * Namespace for state method function signatures.
 */
export const SIGHASH_STATE_NAMESPACE = "state";
/**
 * Namespace for global instruction function signatures (i.e. functions
 * that aren't namespaced by the state or any of its trait implementations).
 */
export const SIGHASH_GLOBAL_NAMESPACE = "global";

const sighash = (nameSpace: string, ixName: string): Buffer => {
  const name = snakeCase(ixName);
  const preimage = `${nameSpace}:${name}`;
  const hasher = new sha256.Hash();
  hasher.update(Buffer.from(preimage));
  return Buffer.from(hasher.digest()).slice(0, 8);
};

const parseIxLayout = (idl: Idl): Map<string, Layout> => {
  const stateMethods = idl.state ? idl.state.methods : [];

  const ixLayouts = stateMethods
    .map((m: IdlStateMethod): [string, Layout] => {
      const fieldLayouts = m.args.map((arg: IdlField) =>
        IdlCoder.fieldLayout(arg, Array.from([...(idl.accounts ?? []), ...(idl.types ?? [])])),
      );
      const name = camelCase(m.name);
      return [name, borsh.struct(fieldLayouts, name)];
    })
    .concat(
      idl.instructions.map((ix) => {
        const fieldLayouts = ix.args.map((arg: IdlField) =>
          IdlCoder.fieldLayout(arg, Array.from([...(idl.accounts ?? []), ...(idl.types ?? [])])),
        );
        const name = camelCase(ix.name);
        return [name, borsh.struct(fieldLayouts, name)];
      }),
    );
  return new Map(ixLayouts);
};

const populateIxLayout = (idl: Idl): Map<string, { layout: Layout; name: string; args: IdlField[] }> => {
  // Instruction args layout. Maps namespaced method
  const ixLayout: Map<string, Layout> = parseIxLayout(idl);

  // Base58 encoded sighash to instruction layout.
  const sighashLayouts: Map<string, { layout: Layout; name: string; args: IdlField[] }> = new Map();

  idl.instructions.forEach((ix) => {
    const sh = sighash(SIGHASH_GLOBAL_NAMESPACE, ix.name);
    sighashLayouts.set(bs58.encode(sh), {
      layout: ixLayout.get(ix.name) as Layout,
      name: ix.name,
      args: ix.args,
    });
  });

  if (idl.state) {
    idl.state.methods.map((ix) => {
      const sh = sighash(SIGHASH_STATE_NAMESPACE, ix.name);
      return sighashLayouts.set(bs58.encode(sh), {
        layout: ixLayout.get(ix.name) as Layout,
        name: ix.name,
        args: ix.args,
      });
    });
  }

  return sighashLayouts;
};

// Map the instructions accounts into an object according to the idl
export const accountsMapper = (idl: Idl): Map<string, IdlAccountItem[]> => {
  // Stores the ix name as the key and the fields as values
  const dataMap = new Map<string, IdlAccountItem[]>();

  // Lets get the properties and get the names and type into an array
  for (const idlInstruction of idl.instructions) {
    dataMap.set(idlInstruction.name, idlInstruction.accounts);
  }

  return dataMap;
};

export const isIdlAccounts = (idlAccountItem: IdlAccountItem): idlAccountItem is IdlAccounts =>
  (idlAccountItem as IdlAccounts).accounts !== undefined;

/**
 * Decodes a program instruction.
 */
export const decodeAnchorIx = (
  idl: Idl,
  instruction: Instruction,
  encoding: "hex" | "base58" = "hex",
  accountsMap: Map<string, IdlAccountItem[]>,
  hasTxErrored: boolean,
): DecodedInstruction | boolean => {
  const sighashLayouts = populateIxLayout(idl);
  if (typeof instruction.data === "string") {
    instruction.data = encoding === "hex" ? Buffer.from(instruction.data, "hex") : bs58.decode(instruction.data);
  }
  const sh = bs58.encode(instruction.data.slice(0, 8));
  const data = Buffer.from(instruction.data.slice(8));
  const decoder = sighashLayouts.get(sh);
  const mappedAccounts: AccountData[] = [];

  if (!decoder) {
    // logger.info(`Instruction not found in IDL for program: ${instruction.program}`);
    // logger.info(`tx_hash: ${instruction.txHash}`);
    // logger.info(`parent_index: ${instruction.parentIdx}`);
    // logger.info(`index: ${instruction.txInstructionIdx}`);

    // We return whether the sighash is an Anchor Instruction
    // of IdlWrite/IdlSetBuffer/IdlCreateAccount
    return sh !== "Bs9xzWfRwBo";
  }

  const name = decoder.name;
  const accounts = accountsMap.get(name);
  if (accounts === undefined) {
    console.log(instruction.txHash);
    return true;
  }

  for (const [idx, account] of accounts.entries()) {
    if (isIdlAccounts(account)) {
      // For now, we don't support nested accounts
      continue;
    }
    const accountData = {
      name: account.name,
      pubKey: instruction.accounts[idx],
      isMut: account.isMut,
      isSigner: account.isSigner,
    };

    mappedAccounts.push(accountData);
  }

  const args = decoder.layout.decode(data);

  for (const [key, value] of Object.entries(args)) {
    try {
      if (BN.isBN(value)) {
        try {
          args[key] = value.toString(10);
        } catch (error) {
          continue;
        }
      } else if (Array.isArray(value)) {
        convertArrayObjectValuesToNumber(value, 0);
      } else if (value instanceof PublicKey) {
        args[key] = value.toString();
      } else if (value && typeof value === "object") {
        args[key] = convertObjectValuesToNumber(value, 0);
      } else if (value && typeof value === "number") {
        args[key] = value.toString();
      }
    } catch (error) {
      continue;
    }
  }
  return {
    accounts: instruction.accounts,
    txHash: instruction.txHash,
    name: decoder.name,
    programHash: instruction.program,
    innerInstructions: [],
    data: {
      accounts: { value: mappedAccounts },
      args: { value: args },
      parentIndex: { value: instruction.parentIdx },
      index: { value: instruction.txInstructionIdx },
    },
    timestamp: instruction.timestamp,
    err: hasTxErrored,
  };
};
