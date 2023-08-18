export type AccountStorageUsed = {
  pub_key: string;
  storage_used: Map<string, number>;
};

export type PublishStorageMessageObject = {
  pub_key: string;
  storage_used: ProgramDataUsed[];
};

export type ProgramDataUsed = {
  program_hash: string;
  bytes_used: number;
};

export type StorageData = Map<string, Map<string, number>>;
