import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import type { PushSubscription } from "web-push";
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthedRequest } from "./auth.js";
import { config, hasYandexNotificationsConfig } from "./config.js";
import { store } from "./dependencies.js";
import { createYandexWebEndpoint, publishYandexWebPush } from "./notifications.js";

const app = express();

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, yandexNotificationsConfigured: hasYandexNotificationsConfig() });
});

app.get("/api/push/public-key", (_req, res) => {
  if (!hasYandexNotificationsConfig()) {
    res.status(503).json({ message: "Yandex Cloud Notifications is not configured" });
    return;
  }

  res.json({ publicKey: config.yandexCloudVapidPublicKey });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password } = parseCredentials(req.body);
  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  if (await store.findUserByEmail(email)) {
    res.status(409).json({ message: "User already exists" });
    return;
  }

  const { salt, passwordHash } = hashPassword(password);
  const user = { id: crypto.randomUUID(), email, passwordHash, salt, createdAt: new Date().toISOString() };
  await store.createUser(user);
  res.status(201).json(toAuthResponse(user.id, user.email));
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = parseCredentials(req.body);
  const user = email ? await store.findUserByEmail(email) : null;

  if (!user || !password || !verifyPassword(password, user.salt, user.passwordHash)) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  res.json(toAuthResponse(user.id, user.email));
});

app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

app.get("/api/push/subscriptions", requireAuth, async (req: AuthedRequest, res) => {
  const subscriptions = await store.getSubscriptionsForUser(req.user!.id);
  res.json({
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      endpoint: subscription.endpoint,
      createdAt: subscription.createdAt
    }))
  });
});

app.post("/api/push/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  if (!hasYandexNotificationsConfig()) {
    res.status(503).json({ message: "Yandex Cloud Notifications is not configured" });
    return;
  }

  const subscription = req.body?.subscription as PushSubscription | undefined;
  if (!subscription?.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
    res.status(400).json({ message: "A valid PushSubscription is required" });
    return;
  }

  try {
    const yandexEndpointArn = await createYandexWebEndpoint(subscription);
    await store.upsertSubscription({
      id: crypto.randomUUID(),
      userId: req.user!.id,
      endpoint: subscription.endpoint,
      yandexEndpointArn,
      subscription,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Unable to create Yandex Cloud notification endpoint", error);
    res.status(502).json({ message: "Unable to register the browser with Yandex Cloud Notifications" });
    return;
  }

  res.status(201).json({ message: "Subscription saved", endpoint: subscription.endpoint });
});

app.post("/api/push/send", requireAuth, async (req: AuthedRequest, res) => {
  if (!hasYandexNotificationsConfig()) {
    res.status(503).json({ message: "Yandex Cloud Notifications is not configured" });
    return;
  }

  const title = sanitizeText(req.body?.title, "Push demo");
  const body = sanitizeText(req.body?.body, "Hello from push_message");
  const subscriptions = await store.getSubscriptionsForUser(req.user!.id);

  const results = await Promise.allSettled(
    subscriptions.map((item) => {
      if (!item.yandexEndpointArn) {
        return Promise.reject(new Error("Subscription has no Yandex Cloud endpoint"));
      }
      return publishYandexWebPush(item.yandexEndpointArn, `${title}: ${body}`);
    })
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected" && isInvalidYandexEndpoint(result.reason)) {
      await store.removeSubscription(subscriptions[index].id);
    }
  }

  res.json({
    attempted: subscriptions.length,
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length
  });
});

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

function parseCredentials(body: unknown) {
  const data = body as Record<string, unknown>;
  const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data?.password === "string" ? data.password : "";
  return !email.includes("@") || password.length < 6 ? { email: "", password: "" } : { email, password };
}

function toAuthResponse(id: string, email: string) {
  return { user: { id, email }, token: signToken({ sub: id, email }) };
}

function sanitizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;
}

function isInvalidYandexEndpoint(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "EndpointDisabledException" || error.name === "NotFoundException")
  );
}