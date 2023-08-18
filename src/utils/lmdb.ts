// import { RootDatabase } from "lmdb";
// import logger from "../loader/log.js";
// import { StoredIDL } from "../types/lmdb.js";

// const insertIdl = (lmdb: RootDatabase, programHash: string, idlMap: string[], idlKey: string, storedIdl: StoredIDL) => {
//   logger.info(`Inserting ${idlKey} into LMDB`);

//   lmdb.put(programHash, idlMap);
//   lmdb.put(idlKey, storedIdl);
// };

// export default insertIdl;
