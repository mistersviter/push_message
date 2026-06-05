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
