import type { PushSubscription } from "web-push";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

export type StoredSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  yandexEndpointArn?: string;
  subscription: PushSubscription;
  createdAt: string;
};

export type Database = {
  users: User[];
  subscriptions: StoredSubscription[];
};