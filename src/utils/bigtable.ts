// import { encode } from "@msgpack/msgpack";
import { Event } from "@coral-xyz/anchor";
import logger from "../loader/log.js";
import { DecodedInstructionWithUsers, IdlInstructionParseError, WebhookInstruction } from "../types/instruction.js";
import { TableData, TableStorageData } from "../types/bigtable.js";
import fastFlatten from "../helpers/fast-flatten.js";
import { StorageData } from "../types/tracking.js";
import { DecodedEvent, DecodedEventWithErrors, IdlEvent } from "../types/event.js";
import differenceFromMaxNumber from "./reverseTimeStamp.js";

export const PROGRAMS_TABLE_NAME = "program_names";
export const MAPPER_TABLE_NAME = "program_name_maps";
export const DEVNET_PROGRAMS_TABLE_NAME = "devnet_program_names";
export const DEVNET_MAPPER_TABLE_NAME = "devnet_program_name_maps";

export const stringToUint = (dataInStr: string) => {
  const uintArray = [];

  for (let i = 0; i < dataInStr.length; i += 1) {
    uintArray[i] = dataInStr.charCodeAt(i);
  }

  return new Uint8Array(uintArray);
};

const generateTableData = (
  decodedInstructionWithUsers: DecodedInstructionWithUsers,
  events: Event<IdlEvent, Record<string, never>>[],
  slotNumber: number,
  network: string,
): { txRowKey: string; tableData: TableData; dataSize: number; webhookNotifications: WebhookInstruction[] } => {
  try {
    const decodedIx = decodedInstructionWithUsers.decodedInstruction;
    const programsTable = network === "mainnet" ? PROGRAMS_TABLE_NAME : DEVNET_PROGRAMS_TABLE_NAME;

    const programsTableData: TableData = {
      tableName: programsTable,
      entries: [],
    };
    // First build the parent instruction
    // Adding tx as a rowkey
    const txRowKey = `${decodedIx.programHash}#${decodedIx.name}#tx#${decodedIx.txHash}`;

    const temp = {
      key: txRowKey,
      data: {
        a: {
          accounts: decodedIx.data.accounts.value,
          args: decodedIx.data.args.value,
          index: decodedIx.data.index.value,
          parentIndex: decodedIx.data.parentIndex.value,
          events,
          err: decodedIx.err,
          slotNumber,
        },
      },
    };

    const encodedData = temp.data.a;

    programsTableData.entries.push({
      key: txRowKey,
      data: { a: { encodedData, timestamp: decodedIx.timestamp } },
    });

    for (const notification of decodedInstructionWithUsers.webhookNotifications) {
      notification.event_data = [
        {
          data: {
            accounts: decodedIx.data.accounts.value,
            args: decodedIx.data.args.value,
            index: decodedIx.data.index.value,
            parentIndex: decodedIx.data.parentIndex.value,
            err: decodedIx.err,
            slotNumber,
          },
          name: decodedIx.name,
        },
      ];
    }

    // This will be used for IAAS only, but for now PNI, we will comment this out until we have a better way to handle this
    // Not required to be pushed for mappers
    // key will be readable account name
    // value is the account's public key
    // for (const data of decodedIx.data.accounts.value) {
    //   const rk = `${decodedIx.programHash}#${decodedIx.name}#${data.name}#${data.pubKey}#${decodedIx.timestamp}#${decodedIx.txHash}`;

    //   const temp = {
    //     key: rk,
    //     data: {
    //       a: txRowKey,
    //     },
    //   };

    // temp.data.a.accounts = {
    //   value: temp.data.a.accounts.value,
    //   timestamp: temp.data.a.accounts.timestamp,
    // };
    // temp.data.a.args = {
    //   value: temp.data.a.args.value,
    //   timestamp: temp.data.a.args.timestamp,
    // };
    // temp.data.a.index = {
    //   value: temp.data.a.index.value.toString(),
    //   timestamp: temp.data.a.index.timestamp,
    // };
    // temp.data.a.parentIndex = {
    //   value: temp.data.a.parentIndex.value.toString(),
    //   timestamp: temp.data.a.parentIndex.timestamp,
    // };

    //   programsTableData.entries.push(temp);
    // }
    return {
      txRowKey,
      tableData: programsTableData,
      dataSize: 0,
      webhookNotifications: decodedInstructionWithUsers.webhookNotifications,
    };
  } catch (error) {
    const err = error as Error;
    logger.error(`[utils/bigtable::generateTableData] ${err.name}: ${err.message}`);
    throw err;
  }
};

// This function takes in a hashmap and produces an array of object that contains the tableName and vector of rowkeys
const programsRowKeyGen = (
  decodedInstructionWithUsers: DecodedInstructionWithUsers,
  events: Event<IdlEvent, Record<string, never>>[],
  slotNumber: number,
  network: string,
): {
  rowKeys: string[];
  tableDatas: TableData[];
  dataSize: number;
  webhookNotifications: WebhookInstruction[];
} => {
  const decodedIx = decodedInstructionWithUsers.decodedInstruction;
  const retWebhookNotifcations: WebhookInstruction[] = [];
  const txMapperRowKeys: string[] = [];
  const tableDatas: TableData[] = [];
  let retDataSize = 0;

  const {
    txRowKey, tableData, dataSize, webhookNotifications,
  } = generateTableData(
    decodedInstructionWithUsers,
    events,
    slotNumber,
    network,
  );
  retWebhookNotifcations.push(...webhookNotifications);
  txMapperRowKeys.push(txRowKey);
  tableDatas.push(tableData);
  retDataSize += dataSize;

  // Oh there's inner ix, time to track them
  if (decodedIx.innerInstructions.length > 0) {
    for (const innerIx of decodedIx.innerInstructions) {
      const {
        txRowKey,
        tableData,
        dataSize,
        webhookNotifications: innerWebhookNotifications,
      } = generateTableData(innerIx, events, slotNumber, network);
      retWebhookNotifcations.push(...innerWebhookNotifications);
      txMapperRowKeys.push(txRowKey);
      tableDatas.push(tableData);
      retDataSize += dataSize;
    }
  }

  return {
    rowKeys: txMapperRowKeys,
    tableDatas,
    dataSize: retDataSize,
    webhookNotifications: retWebhookNotifcations,
  };
};

const generateTableDataFromDecodedIx = async (
  decodedInstructionWithUsers: Promise<DecodedInstructionWithUsers[]>[],
  promisedEvents: Promise<DecodedEventWithErrors>[],
  txHash: string,
  slotNumber: number,
  network: string,
): Promise<TableStorageData> => {
  const eventsSet: Set<DecodedEvent> = new Set();
  const eventErrors: WebhookInstruction[] = [];
  const eventsWithErrors: DecodedEventWithErrors[] = await Promise.all(promisedEvents);

  for (const eventWithError of eventsWithErrors) {
    for (const event of eventWithError.decodedEvents) {
      eventsSet.add(event);
    }

    if (eventWithError.idlEventParseErrors.length > 0) {
      eventErrors.push(...eventWithError.idlEventParseErrors);
    }
  }

  const events: DecodedEvent[] = [...eventsSet];

  const eventsData: Event<IdlEvent, Record<string, never>>[] = fastFlatten(events.map((event) => event.event_data));
  const decodedInstructions: DecodedInstructionWithUsers[][] = await Promise.all(decodedInstructionWithUsers);

  // Should only have 2 items pushed
  const parentInstructions = decodedInstructions[0];
  // if (parentInstructions.length === 0) {
  //   console.log("Bruh no instructions");
  //   throw new Error("Theres nothing to generate");
  // }

  // This means there are inner instructions
  if (decodedInstructions.length === 2) {
    const innerInstructions = decodedInstructions[1];
    for (const innerInstruction of innerInstructions) {
      // Double check if the inner instruction is valid
      if (innerInstruction.decodedInstruction.data.parentIndex.value === -1) {
        logger.warn(`[utils/bigtable::generateTableData] OutOfBound: innerInstruction.parentIndex is -1`);
        continue;
      }

      // Append the inner instruction to the parent instruction
      const parentIxId = parentInstructions.findIndex(
        (pIx) => pIx.decodedInstruction.txHash === innerInstruction.decodedInstruction.txHash,
      );
      parentInstructions[parentIxId].decodedInstruction.innerInstructions.push(innerInstruction);
    }
  }

  const combinedTableData: TableData[][] = [];
  const txProgramStorage: StorageData = new Map();

  const mapperTable = network === "mainnet" ? MAPPER_TABLE_NAME : DEVNET_MAPPER_TABLE_NAME;
  const txKeys: string[] = [];
  const mapperTableDataArr = [];
  const retWebhookNotifcations: WebhookInstruction[] = [];
  const retIdlParseErrors: WebhookInstruction[] = [];
  const reversedBlock = differenceFromMaxNumber(Date.now());
  //  Generate the rowkeys for the instructions, a single tx can have multiple instructions.
  for (const ix of parentInstructions) {
    const {
      rowKeys,
      tableDatas: innerTableDatas,
      dataSize,
      webhookNotifications,
    } = programsRowKeyGen(ix, eventsData, slotNumber, network);

    retWebhookNotifcations.push(...webhookNotifications);
    retIdlParseErrors.push(...ix.idlParseErrors);
    combinedTableData.push(innerTableDatas);
    txKeys.push(...rowKeys);

    const ixProgramHash = ix.decodedInstruction.programHash;
    for (const pubKey of ix.userPubKeyArr) {
      const mapperTableData: TableData = {
        tableName: mapperTable,
        entries: {
          key: `${pubKey}#${ixProgramHash}#${reversedBlock}#${ix.decodedInstruction.timestamp}#${txHash}`,
          data: {
            a: {
              txKeys: txKeys.toString(),
            },
          },
        },
      };
      mapperTableDataArr.push(mapperTableData);

      // We want to add/update our storage map
      const txMapData = txProgramStorage.get(pubKey);

      // We first check if the pubkey data already exists in the map
      if (txMapData) {
        // If it does, we update byte size to the already existing
        // map of storage used or add a new map entry for a different
        // program hash
        let dataSizeToStore = dataSize;
        const prevDataUsed = txMapData.get(ixProgramHash);
        if (prevDataUsed) {
          dataSizeToStore += prevDataUsed;
        }
        txMapData.set(ixProgramHash, dataSizeToStore);
      } else {
        // We create a whole new AccountStorageUsed based on the pubkey
        const txMapDataToStore: Map<string, number> = new Map();
        txMapDataToStore.set(ixProgramHash, dataSize);
        // We finally update the map that we intend to send to our
        // storage tracking service
        txProgramStorage.set(pubKey, txMapDataToStore);
      }
    }
  }
  combinedTableData.push(mapperTableDataArr);

  // Flatten the tabledata we've combined from all the instructions as they can of different instructions in the same tx
  const flattenedTableData = fastFlatten(combinedTableData);

  return {
    tableData: flattenedTableData,
    storageData: txProgramStorage,
    webhookInstructions: retWebhookNotifcations,
    idlInstructionParseErrors: retIdlParseErrors,
    decodedEvents: [...events],
    idlEventParseErrors: eventErrors,
  };
};

export { programsRowKeyGen, generateTableDataFromDecodedIx };
