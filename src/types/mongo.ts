export type UserIdl = {
  program_hash: string;
  status: string;
  network: string;
};

export type User = {
  wallet_pubkey: string;
  idls: UserIdl[];
  webhooks: Webhook[];
};

export type Webhook = {
  webhook_id: string;
};

export type WebhookSubscription = {
  wallet_pubkey: string;
  program_hash: string;
  status: string;
  webhooks: Webhook[];
  events: string[];
  instructions: string[];
};
