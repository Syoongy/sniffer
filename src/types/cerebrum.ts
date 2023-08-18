export type BaseMQMessage = {
  pub_key: string;
  program_hash: string;
  type: string;
  status: string;
};

export type UploadMQMessage = BaseMQMessage & {
  data_as_string: string;
};
