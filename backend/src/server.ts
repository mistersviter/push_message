import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import webpush, { type PushSubscription } from "web-push";
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthedRequest } from "./auth.js";
import { config, hasVapidKeys } from "./config.js";
import { store } from "./dependencies.js";

if (hasVapidKeys()) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

const app = express();

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "256kb" }));

// Reports whether the API is alive and whether VAPID keys are available for Web Push.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, vapidConfigured: hasVapidKeys() });
});

// Returns the public VAPID key that browsers need to create a PushSubscription.
app.get("/api/push/public-key", (_req, res) => {
  if (!hasVapidKeys()) {
    res.status(503).json({ message: "VAPID keys are not configured" });
    return;
  }

  res.json({ publicKey: config.vapidPublicKey });
});

// Creates a demo user and returns an auth token for immediate sign-in.
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
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    salt,
    createdAt: new Date().toISOString()
  };

  await store.createUser(user);
  res.status(201).json(toAuthResponse(user.id, user.email));
});

// Authenticates an existing user with email/password and returns a fresh auth token.
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = parseCredentials(req.body);
  const user = email ? await store.findUserByEmail(email) : null;

  if (!user || !password || !verifyPassword(password, user.salt, user.passwordHash)) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  res.json(toAuthResponse(user.id, user.email));
});

// Returns the current user from the Bearer token, used by the frontend to restore a session.
app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// Lists saved push endpoints for the authenticated user without exposing encryption keys.
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

// Saves the browser PushSubscription for the authenticated user.
app.post("/api/push/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  const subscription = req.body?.subscription as PushSubscription | undefined;
  if (!subscription?.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
    res.status(400).json({ message: "A valid PushSubscription is required" });
    return;
  }

  await store.upsertSubscription({
    id: crypto.randomUUID(),
    userId: req.user!.id,
    endpoint: subscription.endpoint,
    subscription,
    createdAt: new Date().toISOString()
  });

  res.status(201).json({ message: "Subscription saved", endpoint: subscription.endpoint });
});

// Sends a Web Push message to every saved subscription that belongs to the authenticated user.
app.post("/api/push/send", requireAuth, async (req: AuthedRequest, res) => {
  if (!hasVapidKeys()) {
    res.status(503).json({ message: "VAPID keys are not configured" });
    return;
  }

  const title = sanitizeText(req.body?.title, "Push demo");
  const body = sanitizeText(req.body?.body, "Hello from push_message");
  const subscriptions = await store.getSubscriptionsForUser(req.user!.id);

  const payload = JSON.stringify({
    title,
    body,
    icon: "/icon.svg",
    data: { url: config.clientOrigin }
  });

  const results = await Promise.allSettled(
    subscriptions.map((item) => webpush.sendNotification(item.subscription, payload))
  );

  for (const [index, result] of results.entries()) {
    if (
      result.status === "rejected" &&
      typeof result.reason === "object" &&
      result.reason &&
      "statusCode" in result.reason &&
      (result.reason.statusCode === 404 || result.reason.statusCode === 410)
    ) {
      await store.removeSubscription(subscriptions[index].id);
    }
  }

  res.json({
    attempted: subscriptions.length,
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length
  });
});

// Keeps unknown API routes explicit instead of falling through silently.
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

// Normalizes and validates auth form input before it reaches the user store.
function parseCredentials(body: unknown) {
  const data = body as Record<string, unknown>;
  const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data?.password === "string" ? data.password : "";

  if (!email.includes("@") || password.length < 6) {
    return { email: "", password: "" };
  }

  return { email, password };
}

// Shapes auth responses consistently for both register and login.
function toAuthResponse(id: string, email: string) {
  return {
    user: { id, email },
    token: signToken({ sub: id, email })
  };
}

// Keeps notification title/body small and non-empty for push payloads.
function sanitizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;
}
