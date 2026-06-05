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
