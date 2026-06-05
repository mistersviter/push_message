# push_message

Demo project for browser push notifications with an Express + TypeScript backend and React + TypeScript + Vite frontend.

## Setup

```bash
npm install
npm run vapid:generate
```

Create `backend/.env` from `backend/.env.example` and paste the VAPID keys.

```bash
npm run dev
```

Open `http://localhost:5173`, register or sign in, allow notifications, subscribe, then send yourself a push message.

Browser push subscriptions require a secure context. `localhost` works for development; production needs HTTPS.

## API

Base URL in development: `http://localhost:4000`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Checks that the API is running and reports whether VAPID keys are configured. |
| `GET` | `/api/push/public-key` | No | Returns the public VAPID key used by the browser to create a push subscription. |
| `POST` | `/api/auth/register` | No | Creates a user from `{ "email": "...", "password": "..." }` and returns `{ user, token }`. |
| `POST` | `/api/auth/login` | No | Authenticates an existing user from `{ "email": "...", "password": "..." }` and returns `{ user, token }`. |
| `GET` | `/api/me` | Yes | Restores the current user from the Bearer token. |
| `GET` | `/api/push/subscriptions` | Yes | Lists saved subscription endpoints for the current user. |
| `POST` | `/api/push/subscribe` | Yes | Saves `{ "subscription": PushSubscription }` for the current user and returns the endpoint. |
| `POST` | `/api/push/send` | Yes | Sends `{ "title": "...", "body": "..." }` to all saved subscriptions for the current user. |

### Example auth request

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password"}'
```

### Example push send request

```bash
curl -X POST http://localhost:4000/api/push/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"push_message","body":"Hello from the API"}'
```

## Render deploy

The repo includes `render.yaml` for a free Render Blueprint with two services:

- `push-message-api`: Node web service for the Express API.
- `push-message-web`: static site for the Vite frontend.

On Render, create a new Blueprint from this GitHub repo and fill the prompted environment variables:

Backend (`push-message-api`):

- `CLIENT_ORIGIN`: the final frontend URL, for example `https://push-message-web.onrender.com`.
- `VAPID_PUBLIC_KEY`: generated with `npm run vapid:generate`.
- `VAPID_PRIVATE_KEY`: generated with `npm run vapid:generate`.

Frontend (`push-message-web`):

- `VITE_API_URL`: the final backend URL, for example `https://push-message-api.onrender.com`.

Render generates `TOKEN_SECRET` automatically from the Blueprint. Keep `VAPID_SUBJECT` as `mailto:admin@example.com` or replace it with your email.

This demo intentionally uses `backend/data/db.json`. Render free services have an ephemeral filesystem, so users and subscriptions can disappear after redeploys, restarts, or spin-downs.
