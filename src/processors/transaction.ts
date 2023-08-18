import * as solanaWeb3 from "@solana/web3.js";
import base58 from "bs58";
import logger from "../loader/log.js";
import { EncodedTransactionWithMeta } from "../types/blockchain-syncer.js";
import parseAnchorIx from "./anchor-ix-parser.js";
import { isTableStorageData, TableData, TableStorageData, TableStorageDataArr } from "../types/bigtable.js";
import fastFlatten from "../helpers/fast-flatten.js";
import {
  DecodedInstruction,
  DecodedInstructionWithUsers,
  Instruction,
  WebhookInstruction,
} from "../types/instruction.js";
import { StorageData } from "../types/tracking.js";
// import parseAnchorEvent from "./anchor-event-parser.js";
import { DecodedEvent, DecodedEventWithErrors } from "../types/event.js";

/** Returns an array of accounts related to the instruction being parsed */
function getAccounts(accounts: number[], accountKeys: solanaWeb3.PublicKey[]): string[] {
  return accounts.map((accountIdx) => accountKeys[accountIdx].toString());
}

function getChildInnerInstructions(
  childInnerInstructions: solanaWeb3.CompiledInstruction[],
  txHash: string,
  accountKeys: solanaWeb3.PublicKey[],
  parentIdx: number,
  blockTimestampInMS: number,
): Instruction[] {
  const retInstructionArr: Instruction[] = [];

  // parentIdx and cInnerIdx can be used together
  // for e.g parentIdx = 3 and cInnerIdx = 1
  // we can then derive the inner instruction to be 3.1
  for (const [cInnerIdx, childInnerInstruction] of childInnerInstructions.entries()) {
    let dataToBeSent = new Uint8Array();
    try {
      // Decode the bs58 encoded data into bytes
      dataToBeSent = base58.decode(childInnerInstruction.data);
    } catch (error) {
      dataToBeSent = Buffer.from(childInnerInstruction.data);
    }
    const programHash = accountKeys[childInnerInstruction.programIdIndex];
    if (programHash) {
      const tmpInstruction: Instruction = {
        txInstructionIdx: cInnerIdx,
        txHash,
        program: programHash.toString(),
        data: dataToBeSent,
        parentIdx,
        accounts: getAccounts(childInnerInstruction.accounts, accountKeys),
        timestamp: blockTimestampInMS,
      };
      retInstructionArr.push(tmpInstruction);
    } else {
      logger.warn(`index:: ${childInnerInstruction.programIdIndex}`);
      for (const key of accountKeys) {
        logger.warn(`accountKeys:: ${key.toString()}`);
      }
    }
  }

  return retInstructionArr;
}

export default async function processEncodedTransactions(
  blockTimestampInMS: number,
  blockTransactions: EncodedTransactionWithMeta[],
  whitelistedPrograms: string[],
): Promise<Map<string, DecodedInstruction[]>> {
  // const startTime = Date.now();
  // const tableDataset: TableData[] = [];
  const instructionPromises: Promise<TableStorageData>[] = [];
  const pureInstructionPromises: Promise<DecodedInstruction[]>[][] = [];
  const address = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
  for (const blockTransaction of blockTransactions) {
    // Each item in the signatures array is a digital signature
    // of the given message
    const transaction = blockTransaction.transaction;
    const hasTxErrored = blockTransaction.meta?.err !== null;

    // Additional safety net
    if (transaction.signatures.length >= 1) {
      // Signatures should be string[].
      // The first one, signatures[0], is the hash that is used to
      // identify the transaction (eg. in the explorer)
      const txHash = transaction.signatures[0];
      const txMsgInstructions = transaction.message.compiledInstructions;
      let txMsgAccountKeys: solanaWeb3.MessageAccountKeys;
      try {
        txMsgAccountKeys = transaction.message.getAccountKeys();
      } catch (error) {
        txMsgAccountKeys = new solanaWeb3.MessageAccountKeys(
          transaction.message.staticAccountKeys,
          blockTransaction.meta?.loadedAddresses,
        );
      }

      // Each instruction specifies a single program, a subset of
      // the transaction's accounts that should be passed to the program,
      // and a data byte array that is passed to the program. The program
      // interprets the data array and operates on the accounts specified
      // by the instructions. The program can return successfully, or
      // with an error code. An error return causes the entire
      // transaction to fail immediately.

      /** We first want to process the instructions and add these to the tasks */
      if (txMsgInstructions.length > 0) {
        const processables: Instruction[] = [];
        const eventPromises: Promise<DecodedEventWithErrors>[] = [];
        const decodedInstructions: Promise<DecodedInstruction[]>[] = [];

        // Start processing instructions
        for (const [idx, instruction] of txMsgInstructions.entries()) {
          const retrievedKey = txMsgAccountKeys.get(instruction.programIdIndex);

          if (retrievedKey && retrievedKey.toString() === address) {
            // Pack data from the Transaction into our Instruction type
            const instruction = txMsgInstructions[idx];
            const program = retrievedKey.toString();
            let dataToBeSent = new Uint8Array();
            try {
              // Decode the bs58 encoded data into bytes
              dataToBeSent = base58.decode(instruction.data.toString());
            } catch (error) {
              dataToBeSent = instruction.data;
            }

            // -1 Means that this is a parent instruction
            const instructionToBePushed: Instruction = {
              txInstructionIdx: idx,
              txHash,
              program,
              data: dataToBeSent,
              parentIdx: -1,
              accounts: getAccounts(instruction.accountKeyIndexes, fastFlatten(txMsgAccountKeys.keySegments())),
              timestamp: blockTimestampInMS,
            };
            processables.push(instructionToBePushed);
          }
        }

        // Pushes all parent instructions to decodedInstructions
        decodedInstructions.push(parseAnchorIx(processables, hasTxErrored));

        if (blockTransaction.meta?.logMessages) {
          // eventPromises.push(
          //   parseAnchorEvent(
          //     processables,
          //     db,
          //     txHash,
          //     blockTransaction.meta.logMessages,
          //     network,
          //     mode,
          //     notificationsRascalBroker,
          //   ),
          // );
        }

        // Start processing of inner instructions
        // We first want to check whether this block transaction has inner instructions
        if (blockTransaction.meta?.innerInstructions && blockTransaction.meta.innerInstructions.length > 0) {
          const innerInstructions = blockTransaction.meta.innerInstructions;
          // Solana web3.js only returns us CompiledInstructions
          let innerProcessables: Instruction[] = [];

          for (let pInnerIdx = 0; pInnerIdx < innerInstructions.length; pInnerIdx += 1) {
            // Parent Index
            const parentInnerInstruction = innerInstructions[pInnerIdx];
            // We now want to loop through the inner instructions within the parentInnerInstruction
            const childInnerInstructions = parentInnerInstruction.instructions;

            const parsedInstructions: Instruction[] = getChildInnerInstructions(
              childInnerInstructions,
              txHash,
              fastFlatten(txMsgAccountKeys.keySegments()),
              parentInnerInstruction.index,
              blockTimestampInMS,
            );

            // parsedResults.push(
            //   parsedInstructions.filter((parsedInstruction) => whitelistedPrograms.includes(parsedInstruction.program)),
            // );
            // TODO: Find out how to include programs we don't support, but most importantly support native programs here
            const filteredParsedInstructions = parsedInstructions.filter((parsedInstruction) =>
              whitelistedPrograms.includes(parsedInstruction.program),
            );
            innerProcessables = [...innerProcessables, ...filteredParsedInstructions];
          }

          // Pushes all inner instructions into the decodedInstructions
          decodedInstructions.push(parseAnchorIx(innerProcessables, hasTxErrored));
        }

        // instructionPromises.push(
        //   generateTableDataFromDecodedIx(decodedInstructions, eventPromises, txHash, slotNumber, network),
        // );
        pureInstructionPromises.push(decodedInstructions);
      }
    } else {
      logger.error("[processors/transaction::processEncodedTransactions] FATAL: a transaction has no hashes!");
    }
  }

  // const resPromises = await Promise.allSettled(
  //   [instructionPromises].map(async (item) => await Promise.allSettled(item)),
  // );
  const resPromises = await Promise.allSettled(instructionPromises);

  const resInstructionPromises = await Promise.all(fastFlatten(pureInstructionPromises));

  const resInstructions = fastFlatten(resInstructionPromises);

  const txMap: Map<string, DecodedInstruction[]> = new Map();

  for (const instructinon of resInstructions) {
    const tx = txMap.get(instructinon.txHash);
    if (tx) {
      tx.push(instructinon);
    } else {
      txMap.set(instructinon.txHash, [instructinon]);
    }
  }
  return txMap;
}
