import { DecodedEvent } from "./event.js";
import { IdlInstructionParseError, WebhookInstruction } from "./instruction.js";
import { StorageData } from "./tracking.js";

export type Entry = {
  key: string;
  mutations: any;
};

export type TableData = {
  tableName: string;
  entries: any;
};

export function isTableStorageData(data: TableStorageData | DecodedEvent[]): data is TableStorageData {
  return (<TableStorageData>data).tableData !== undefined;
}
export type TableStorageData = {
  tableData: TableData[];
  storageData: StorageData;
  webhookInstructions: WebhookInstruction[];
  idlInstructionParseErrors: WebhookInstruction[];
  decodedEvents: DecodedEvent[];
  idlEventParseErrors: WebhookInstruction[];
};

export type TableStorageDataArr = {
  tableData: TableData[];
  storageDataArr: StorageData[];
  webhookEvents: DecodedEvent[];
  webhookInstructions: WebhookInstruction[];
  idlInstructionParseErrors: WebhookInstruction[];
  idlEventParseErrors: WebhookInstruction[];
};
