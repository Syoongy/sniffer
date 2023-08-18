import {
  Blockhash,
  CompiledInstruction,
  ConfirmedTransactionMeta,
  MessageHeader,
  ParsedAddressTableLookup,
  TransactionVersion,
  VersionedMessage,
} from "@solana/web3.js";

export type BlockchainSyncer = {
  appState: Object; // AppState type needs to be created
  amqpConnection: Object; // Based on selected library
  bigTableConnection: Object; // Based on selected library
  shutdown: Object;
  batchCount: number;
  batchLimit: number;
};

export type TableBlob = {
  tableName: string;
  blobs: string[];
};

export type BlockQueueItem = {
  numbers: number[];
  programs: string[];
};

export type EncodedTransactionWithMeta = {
  /** The transaction */
  transaction: {
    /** The transaction message */
    message: VersionedMessage;
    /** The transaction signatures */
    signatures: string[];
  };
  /** Metadata produced from the transaction */
  meta: ConfirmedTransactionMeta | null;
  /** The transaction version */
  version?: TransactionVersion;
};

export type RpcResponse<T> =
  | {
      jsonrpc: string;
      id: number;
      result: T;
    }
  | {
      jsonrpc: string;
      id: number;
      error: {
        code: unknown;
        message: string;
        data?: any;
      };
    };

export type Transactions = {
  blockhash: Blockhash;
  previousBlockhash: Blockhash;
  parentSlot: number;
  transactions: Transaction[];
  rewards: Reward[];
  blockTime: number | null;
  blockHeight: number | null;
};

/** Transaction with status meta and original message */
export type Transaction = {
  transaction: {
    message: MessageResponse;
    signatures: string[];
  };
  meta: ConfirmedTransactionMeta | null;
  version: TransactionVersion;
};

/** Adapted from the [library source code](https://github.com/solana-labs/solana-web3.js/blob/c0a35b63f10061f81c7ec2c8a76b09314bb0f140/src/connection.ts#L1015) */
export type MessageResponse = {
  accountKeys: string[];
  header: MessageHeader;
  instructions: CompiledInstruction[];
  recentBlockhash: string;
  addressTableLookups: ParsedAddressTableLookup[] | null;
};

/** Block reward */
export type Reward = {
  pubkey: string;
  lamports: number;
  postBalance: number | null;
  rewardType: string | null;
};
