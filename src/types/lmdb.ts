import { Idl } from "../anchor-utils/idl.js";

export type StoredIDL = {
  whitelisted: boolean;
  whitelistedEventWebhook: boolean;
  whitelistedInstructionWebhook: boolean;
  idl: Idl;
};

export type TableData = {
  tableName: string;
  entries: any;
};

export type StandaloneIDL = {
  pub_key: string;
  program_hash: string;
  idl_string: string;
};
