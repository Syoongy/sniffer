import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

function convertObjectValuesToNumber(value: any, depth: number) {
  if (depth >= 11) {
    return value.toString();
  }
  if (BN.isBN(value)) {
    try {
      return value.toString(10);
    } catch (error) {
      const err = error as Error;
      throw err;
    }
  }
  for (const [objKey, objVal] of Object.entries(value)) {
    if (objKey === "_bn") {
      continue;
    }
    try {
      if (BN.isBN(objVal)) {
        try {
          value[objKey] = objVal.toString(10);
        } catch (error) {
          continue;
        }
      } else if (Array.isArray(value)) {
        convertArrayObjectValuesToNumber(value, depth + 1);
      } else if (objVal instanceof PublicKey) {
        value[objKey] = objVal.toString();
      } else if (objVal && typeof objVal === "object") {
        value[objKey] = convertObjectValuesToNumber(objVal, depth + 1);
      } else if (objVal && typeof objVal === "number") {
        value[objKey] = objVal.toString();
      }
    } catch (error) {
      continue;
    }
  }
  return value;
}

function convertArrayObjectValuesToNumber(valueArr: any[], depth: number) {
  if (depth >= 11) {
    return valueArr;
  }

  for (let index = 0; index < valueArr.length; index += 1) {
    const itemVal = valueArr[index];
    if (BN.isBN(itemVal)) {
      try {
        // We are only dealing with an obj of big numbers phew!
        valueArr[index] = itemVal.toString(10);
      } catch (error) {
        continue;
      }
    } else if (Array.isArray(itemVal)) {
      convertArrayObjectValuesToNumber(itemVal, depth + 1);
    } else if (itemVal instanceof PublicKey) {
      valueArr[index] = itemVal.toString();
    } else if (typeof itemVal === "object") {
      valueArr[index] = convertObjectValuesToNumber(itemVal, depth + 1);
    } else if (typeof itemVal === "number") {
      valueArr[index] = itemVal.toString();
    }
  }
  return valueArr;
}

export { convertArrayObjectValuesToNumber, convertObjectValuesToNumber };
