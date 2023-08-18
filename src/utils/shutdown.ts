import logger from "../loader/log.js";

const gracefulShutdownHandler = async (signal: any) => {
  // Handle and close everything here
  // We may want to have global variables for the tasks that need to be
  // shutdown along with implementing their own internal  shutdown functions
  logger.info(`${signal} signal received`);
  process.exit(0);
};

export default gracefulShutdownHandler;
