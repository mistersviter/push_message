import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  tokenSecret: process.env.TOKEN_SECRET ?? 'dev-token-secret-change-me',
  yandexCloudNotificationChannelArn: process.env.YANDEX_CLOUD_NOTIFICATION_CHANNEL_ARN ?? '',
  yandexCloudStaticKeyId: process.env.YANDEX_CLOUD_STATIC_KEY_ID ?? '',
  yandexCloudStaticKeySecret: process.env.YANDEX_CLOUD_STATIC_KEY_SECRET ?? '',
  yandexCloudVapidPublicKey: process.env.YANDEX_CLOUD_VAPID_PUBLIC_KEY ?? ''
};

export function hasYandexNotificationsConfig() {
  return Boolean(
    config.yandexCloudNotificationChannelArn &&
      config.yandexCloudStaticKeyId &&
      config.yandexCloudStaticKeySecret &&
      config.yandexCloudVapidPublicKey
  );
}