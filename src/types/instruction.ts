// If parent index is -1, it is not an inner instruction.
// parentIndex and index can be used together
// for e.g parentIdx = 3 and cInnerIdx = 1

import { DecodedEvent } from "./event.js";

// we can then derive the inner instruction to be 3.1
export type DecodedInstruction = {
  txHash: string;
  timestamp: number;
  name: string;
  accounts: string[];
  programHash: string;
  // Using any here as data is dynamically typed
  data: InstructionData;
  innerInstructions: DecodedInstructionWithUsers[];
  err: boolean;
};

export function isDecodedInstruction(data: DecodedInstruction | boolean): data is DecodedInstruction {
  return typeof data !== "boolean";
}

export type DecodedInstructionWithUsers = {
  decodedInstruction: DecodedInstruction;
  userPubKeyArr: string[];
  webhookNotifications: WebhookInstruction[];
  idlParseErrors: WebhookInstruction[];
};

export type DecodedInstructionWithUsersAndEvents = {
  decodedEvents: DecodedEvent[];
} & DecodedInstructionWithUsers;

// Instruction data to be pushed
export type InstructionData = {
  parentIndex: any;
  index: any;
  accounts: any;
  args: any;
};

export type EntryValue<T> = {
  value: T;
};

export type AccountData = {
  name: string;
  pubKey: string;
  isMut: boolean;
  isSigner: boolean;
};

export type Arg = {
  name: string;
  type: string;
};

export type Instruction = {
  // The local unique identifier of the instruction according to the transaction (not based on solana)
  txInstructionIdx: number;
  // The transaction this instruction belongs to.
  txHash: string;
  // The name of the program invoking this instruction.
  program: string;
  // The data contained from invoking this instruction.
  data: Uint8Array;
  // If this is an inner instruction, we should depend on this
  parentIdx: number;
  // The accounts relating to this transaction.
  accounts: string[];
  // The time this log was created in our time
  timestamp: number;
};

export type WebhookInstruction = {
  pub_key: string;
  program_hash: string;
  tx_hash: string;
  event_data?: any[];
};

export type IdlInstructionParseError = {
  pub_key: string;
  program_hash: string;
  tx_hash: string;
  timestamp: number;
};
