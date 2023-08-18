import { Idl } from "../anchor-utils/idl.js";
import { accountsMapper, decodeAnchorIx } from "../anchor-utils/ix-decoder.js";
import logger from "../loader/log.js";
import { DecodedInstruction, Instruction, isDecodedInstruction } from "../types/instruction.js";
import jupV6 from "../idls/jupV6.js";
import jupV4 from "../idls/jupV4.js";
import whirlpool from "../idls/whirlpool.js";

const getDecodedInstructionData = async (
  idl: Idl,
  instruction: Instruction,
  hasTxErrored: boolean,
): Promise<DecodedInstruction> =>
  new Promise((resolve, reject) => {
    try {
      const accountsMap = accountsMapper(idl);
      const tmpDecodedInstruction = decodeAnchorIx(idl, instruction, "base58", accountsMap, hasTxErrored);

      if (isDecodedInstruction(tmpDecodedInstruction)) {
        resolve(tmpDecodedInstruction);
      } else {
        console.log(tmpDecodedInstruction);
        reject(tmpDecodedInstruction);
      }
    } catch (error) {
      console.log(instruction.txHash);
      reject(error);
    }
  });

const decodeInstruction = async (
  instruction: Instruction,
  hasTxErrored: boolean,
): Promise<DecodedInstruction | null> => {
  try {
    const res = await getDecodedInstructionData(whirlpool, instruction, hasTxErrored);
    return res;
  } catch (error) {
    const err = error as Error;
    logger.error(`[processors/anchor-ix-parser::decodeInstruction] ${err.name}: ${err.message}`);
  }
  return null;
};

// Parsing of the anchor ix will only happen when conditions are met:
// 1. We have have the deployed program's idl
// 2. We have the deployed program hash
const parseAnchorIx = async (instructions: Instruction[], hasTxErrored: boolean): Promise<DecodedInstruction[]> => {
  const decodedInstructions: DecodedInstruction[] = [];
  const parserPromises = [];
  try {
    for (const instruction of instructions) {
      // We can probably convert this into a async function and Promise.all() outside this loop
      parserPromises.push(decodeInstruction(instruction, hasTxErrored));
    }
    const resInstructions = await Promise.all(parserPromises);
    for (const decodedInstruction of resInstructions) {
      if (decodedInstruction) {
        decodedInstructions.push(decodedInstruction);
      }
    }
    // console.log(`It took ${Date.now() - startTime}ms`);
    // decodedInstructions = [...fastFlatten(resInstructions)];
  } catch (error) {
    const err = error as Error;
    logger.error(`[processors/anchor-ix-parser::parseAnchorIx] ${err.name}: ${err.message}`);
  }
  return decodedInstructions;
};

export default parseAnchorIx;
