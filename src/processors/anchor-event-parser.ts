// import { RootDatabase } from "lmdb";
// import { BrokerAsPromised } from "rascal";
// import { BorshCoder, Event } from "@coral-xyz/anchor";
// import { PublicKey } from "@solana/web3.js";
// import { EventParser } from "../anchor-utils/event-decoder.js";
// import { Idl } from "../anchor-utils/idl.js";
// import logger from "../loader/log.js";
// import { Instruction, WebhookInstruction } from "../types/instruction.js";
// import { StoredIDL } from "../types/lmdb.js";
// import { DecodedEvent, DecodedEventWithErrors, IdlEvent } from "../types/event.js";
// import fastFlatten from "../helpers/fast-flatten.js";

// const getIDL = async (db: RootDatabase, program: string): Promise<StoredIDL | undefined> => {
//   const res = await db.get(program);
//   if (res && res.idl) {
//     return {
//       whitelisted: res.whitelisted as boolean,
//       whitelistedEventWebhook: res.whitelistedEventWebhook as boolean,
//       whitelistedInstructionWebhook: res.whitelistedInstructionWebhook as boolean,
//       idl: JSON.parse(JSON.stringify(res.idl)) as Idl,
//     };
//   }

//   return undefined;
// };

// const getIDLMap = async (db: RootDatabase, program: string): Promise<string[] | undefined> => {
//   const res: string[] = await db.get(program);
//   return res;
// };

// const getDecodedEvents = (program: string, idl: Idl, logs: string[]): Event<IdlEvent, Record<string, never>>[] => {
//   let retEvents: Event<IdlEvent, Record<string, never>>[] = [];
//   if (logs) {
//     const eventParser = new EventParser(new PublicKey(program), new BorshCoder(idl));
//     retEvents = eventParser.parseLogs(logs, idl);
//   }
//   return retEvents;
// };

// const decodeEvent = async (
//   db: RootDatabase,
//   program: string,
//   txHash: string,
//   logs: string[],
//   network: string,
//   mode: string,
//   notificationsBroker: BrokerAsPromised,
// ): Promise<{ decodedEvents: DecodedEvent[]; idlEventParseErrors: WebhookInstruction[] }> => {
//   const decodedEvents: DecodedEvent[] = [];
//   const idlEventParseErrors: WebhookInstruction[] = [];
//   const currTime = Date.now();
//   try {
//     const idlMap = await getIDLMap(db, program);
//     if (idlMap !== undefined) {
//       await Promise.allSettled(
//         idlMap.map(async (idlKey) => {
//           const idl = await getIDL(db, idlKey);
//           if (idl && idl.whitelistedEventWebhook) {
//             try {
//               const retIDL = idl.idl;
//               const splitIdlKey = idlKey.split("/");
//               const retEvents = getDecodedEvents(program, retIDL, logs);
//               if (retEvents.length > 0) {
//                 decodedEvents.push({
//                   pub_key: splitIdlKey[0],
//                   program_hash: splitIdlKey[1],
//                   tx_hash: txHash,
//                   event_data: retEvents,
//                 });
//               }
//             } catch (error) {
//               if (mode === "frontfill") {
//                 db.put(idlKey, idl);
//                 idlEventParseErrors.push({
//                   pub_key: idlKey.split("/")[0],
//                   program_hash: program,
//                   tx_hash: txHash,
//                   event_data: [currTime],
//                 });
//                 // notificationsBroker.publish("IndexerIdlParseError", {
//                 //   type: "eventParseError",
//                 //   data: [
//                 //     {
//                 //       pub_key: idlKey.split("/")[0],
//                 //       program_hash: program,
//                 //       tx_hash: txHash,
//                 //       event_data: {},
//                 //     },
//                 //   ],
//                 //   timestamp: Date.now(),
//                 //   network,
//                 // });
//               }
//             }
//           }
//         }),
//       );
//     }
//   } catch (error) {
//     const err = error as Error;
//     logger.error(`[processors/anchor-event-parser::decodeEvent] ${err.name}: ${err.message}`);
//   }
//   return { decodedEvents, idlEventParseErrors };
// };

// // Parsing of the anchor ix will only happen when conditions are met:
// // 1. We have have the deployed program's idl
// // 2. We have the deployed program hash
// const parseAnchorEvent = async (
//   instructions: Instruction[],
//   db: RootDatabase,
//   txHash: string,
//   logs: string[],
//   network: string,
//   mode: string,
//   notificationsBroker: BrokerAsPromised,
// ): Promise<DecodedEventWithErrors> => {
//   const decodedEventsArr: DecodedEvent[][] = [];
//   const idlEventParseErrorsArr: WebhookInstruction[][] = [];
//   const parserPromises = [];
//   try {
//     for (const instruction of instructions) {
//       // We can probably convert this into a async function and Promise.all() outside this loop
//       parserPromises.push(decodeEvent(db, instruction.program, txHash, logs, network, mode, notificationsBroker));
//     }
//     const resDecodedEvents = await Promise.allSettled(parserPromises);
//     for (const decodedEvents of resDecodedEvents) {
//       if (decodedEvents.status === "fulfilled") {
//         if (decodedEvents.value.decodedEvents.length > 0) decodedEventsArr.push(decodedEvents.value.decodedEvents);
//         if (decodedEvents.value.idlEventParseErrors.length > 0) {
//           idlEventParseErrorsArr.push(decodedEvents.value.idlEventParseErrors);
//         }
//       }
//     }
//   } catch (error) {
//     const err = error as Error;
//     logger.error(`[processors/anchor-event-parser::parseAnchorEvent] ${err.name}: ${err.message}`);
//   }
//   return { decodedEvents: fastFlatten(decodedEventsArr), idlEventParseErrors: fastFlatten(idlEventParseErrorsArr) };
// };

// export default parseAnchorEvent;
