import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { store } from "./dependencies.js";

type TokenPayload = {
  sub: string;
  email: string;
  exp: number;
};

export type AuthedRequest = Request & {
  user?: {
    id: string;
    email: string;
  };
};

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, passwordHash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { passwordHash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, "hex"), Buffer.from(expectedHash, "hex"));
}

export function signToken(payload: Omit<TokenPayload, "exp">) {
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(body);
  return `${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || sign(body) !== signature) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(body)) as TokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const user = await store.findUserById(payload.sub);
  if (!user) {
    res.status(401).json({ message: "User no longer exists" });
    return;
  }

  req.user = { id: user.id, email: user.email };
  next();
}

function sign(value: string) {
  return crypto.createHmac("sha256", config.tokenSecret).update(value).digest("base64url");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
