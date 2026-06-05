import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  tokenSecret: process.env.TOKEN_SECRET ?? "dev-token-secret-change-me",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? ""
};

export function hasVapidKeys() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}
