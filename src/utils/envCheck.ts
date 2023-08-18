import logger from "../loader/log.js";

const envCheck = (varName: string): string => {
  const varToCheck = process.env[varName];
  if (varToCheck === undefined) {
    logger.error(`[utils/envCheck::envCheck] ValueError: ${varName} not defined`);
    throw new Error(`${varName} not defined`);
  }
  return varToCheck;
};

export default envCheck;
