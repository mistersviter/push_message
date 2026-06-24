import {
  CreatePlatformEndpointCommand,
  PublishCommand,
  SNSClient
} from "@aws-sdk/client-sns";
import type { PushSubscription } from "web-push";
import { config } from "./config.js";

const client = new SNSClient({
  endpoint: "https://notifications.yandexcloud.net/",
  region: "ru-central1",
  credentials: {
    accessKeyId: config.yandexCloudStaticKeyId,
    secretAccessKey: config.yandexCloudStaticKeySecret
  }
});

export async function createYandexWebEndpoint(subscription: PushSubscription) {
  const response = await client.send(
    new CreatePlatformEndpointCommand({
      PlatformApplicationArn: config.yandexCloudNotificationChannelArn,
      Token: JSON.stringify(subscription)
    })
  );

  if (!response.EndpointArn) {
    throw new Error("Yandex Cloud did not return an endpoint ARN");
  }

  return response.EndpointArn;
}

export function publishYandexWebPush(endpointArn: string, message: string) {
  return client.send(
    new PublishCommand({
      TargetArn: endpointArn,
      MessageStructure: "json",
      Message: JSON.stringify({ default: message, WEB: message })
    })
  );
}