import React from "react";
import { createRoot } from "react-dom/client";
import { Bell, Eye, EyeOff, LogIn, LogOut, Send, UserPlus, Wifi } from "lucide-react";
import "./styles.css";

type User = {
  id: string;
  email: string;
};

type AuthMode = "login" | "register";

type AuthResponse = {
  user: User;
  token: string;
};

type PushSubscriptionInfo = {
  id: string;
  endpoint: string;
  createdAt: string;
};

type NotificationStatus = NotificationPermission | "not-signed-in" | "unsupported";

const tokenKey = "push_message_token";
const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

function App() {
  const [mode, setMode] = React.useState<AuthMode>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [authError, setAuthError] = React.useState("");
  const [user, setUser] = React.useState<User | null>(null);
  const [token, setToken] = React.useState(() => localStorage.getItem(tokenKey) ?? "");
  const [message, setMessage] = React.useState("Привет! Это тестовый push.");
  const [title, setTitle] = React.useState("push_message");
  const [status, setStatus] = React.useState("Готов к настройке.");
  const [permission, setPermission] = React.useState<NotificationStatus>("not-signed-in");
  const [subscriptionEndpoints, setSubscriptionEndpoints] = React.useState<string[]>([]);
  const [isBusy, setIsBusy] = React.useState(false);

  React.useEffect(() => {
    if (!token) {
      resetPushState();
      return;
    }

    let isCurrent = true;
    resetPushState();

    api<{ user: User }>("/api/me", { token })
      .then((data) => {
        if (!isCurrent) return;

        setUser(data.user);
        setPermission(getNotificationPermission());
        loadUserSubscriptions(token, isCurrent).catch((error) => {
          if (isCurrent) {
            setStatus(getErrorMessage(error));
          }
        });
      })
      .catch(() => {
        if (!isCurrent) return;

        localStorage.removeItem(tokenKey);
        setToken("");
        setUser(null);
        resetPushState();
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setAuthError("Введите корректный email.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Пароль должен быть не короче 6 символов.");
      return;
    }

    setIsBusy(true);

    try {
      const data = await api<AuthResponse>(`/api/auth/${mode}`, {
        method: "POST",
        body: { email: normalizedEmail, password }
      });

      localStorage.setItem(tokenKey, data.token);
      setUser(data.user);
      resetPushState();
      setPermission(getNotificationPermission());
      setToken(data.token);
      loadUserSubscriptions(data.token, true).catch((error) => {
        setStatus(getErrorMessage(error));
      });
      setStatus(mode === "register" ? "Пользователь создан." : "Вы вошли.");
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function subscribe() {
    if (!token) {
      setStatus("Сначала войдите в аккаунт.");
      return;
    }

    if (!supportsNotifications()) {
      setPermission("unsupported");
      setStatus("Этот браузер не поддерживает Notification API.");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Этот браузер не поддерживает Web Push.");
      return;
    }

    setIsBusy(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setStatus("Разрешение на уведомления не выдано.");
        return;
      }

      const [{ publicKey }, registration] = await Promise.all([
        api<{ publicKey: string }>("/api/push/public-key"),
        navigator.serviceWorker.register("/sw.js")
      ]);

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      const savedSubscription = await api<{ endpoint: string }>("/api/push/subscribe", {
        method: "POST",
        token,
        body: { subscription }
      });

      setSubscriptionEndpoints([savedSubscription.endpoint]);
      setStatus("Подписка сохранена. Теперь можно отправлять push.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function sendPush(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);

    try {
      const result = await api<{ attempted: number; sent: number; failed: number }>("/api/push/send", {
        method: "POST",
        token,
        body: { title, body: message }
      });
      setStatus(`Отправлено: ${result.sent}, ошибок: ${result.failed}, подписок: ${result.attempted}.`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(tokenKey);
    setToken("");
    setUser(null);
    setAuthError("");
    resetPushState();
    setStatus("Вы вышли.");
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setAuthError("");
  }

  function resetPushState() {
    setSubscriptionEndpoints([]);
    setPermission("not-signed-in");
  }

  async function loadUserSubscriptions(authToken: string, isCurrent: boolean) {
    const data = await api<{ subscriptions: PushSubscriptionInfo[] }>("/api/push/subscriptions", {
      token: authToken
    });

    if (isCurrent) {
      setSubscriptionEndpoints(data.subscriptions.map((subscription) => subscription.endpoint));
    }
  }

  const notificationStatus = user ? permission : "Войдите";
  const serviceWorkerStatus = user ? ("serviceWorker" in navigator ? "available" : "missing") : "Войдите";
  const pushManagerStatus = user ? ("PushManager" in window ? "available" : "missing") : "Войдите";
  const endpointText = user
    ? subscriptionEndpoints.length > 0
      ? subscriptionEndpoints.join("\n\n")
      : "У этого пользователя подписка еще не сохранена"
    : "Войдите, чтобы увидеть endpoint пользователя";
  const authTitle = mode === "login" ? "Вход в аккаунт" : "Новый аккаунт";
  const authDescription =
    mode === "login" ? "Введите email и пароль, чтобы продолжить." : "Создайте пользователя для демо push-сообщений.";
  const authButtonLabel = mode === "login" ? "Войти" : "Создать аккаунт";

  return (
    <main className="shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Web Push demo</p>
            <h1>push_message</h1>
          </div>
          <div className="session">
            <span>{user ? user.email : "Гость"}</span>
            {user && (
              <button type="button" className="iconButton" onClick={logout} aria-label="Выйти" title="Выйти">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>

        <div className="grid">
          <section className="panel authPanel">
            <div className="panelHeader">
              {mode === "login" ? <LogIn size={20} /> : <UserPlus size={20} />}
              <h2>{authTitle}</h2>
            </div>
            <p className="authIntro">{authDescription}</p>

            <div className="segmented" role="tablist" aria-label="Режим авторизации">
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => selectMode("login")}
                role="tab"
                aria-selected={mode === "login"}
              >
                <LogIn size={16} />
                Вход
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : ""}
                onClick={() => selectMode("register")}
                role="tab"
                aria-selected={mode === "register"}
              >
                <UserPlus size={16} />
                Регистрация
              </button>
            </div>

            <form onSubmit={handleAuth} className="stack authForm" noValidate>
              <label className="field">
                <span>Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label className="field">
                <span>Пароль</span>
                <div className="passwordControl">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="Минимум 6 символов"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="fieldIconButton"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              {authError && <div className="inlineError">{authError}</div>}

              <button type="submit" className="primary authSubmit" disabled={isBusy}>
                {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
                {isBusy ? "Подождите..." : authButtonLabel}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <Bell size={20} />
              <h2>Подписка</h2>
            </div>
            <div className="statusRows">
              <div>
                <span>Notification API</span>
                <b>{notificationStatus}</b>
              </div>
              <div>
                <span>Service Worker</span>
                <b>{serviceWorkerStatus}</b>
              </div>
              <div>
                <span>PushManager</span>
                <b>{pushManagerStatus}</b>
              </div>
            </div>
            <div className="endpointBox">
              <span>Endpoint</span>
              <code>{endpointText}</code>
            </div>
            <button type="button" className="primary secondary" onClick={subscribe} disabled={isBusy || !user}>
              <Wifi size={18} />
              Разрешить и подписаться
            </button>
          </section>

          <section className="panel sendPanel">
            <div className="panelHeader">
              <Send size={20} />
              <h2>Отправить push</h2>
            </div>
            <form onSubmit={sendPush} className="stack">
              <label className="field">
                <span>Заголовок</span>
                <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
              </label>
              <label className="field">
                <span>Сообщение</span>
                <textarea value={message} onChange={(event) => setMessage(event.currentTarget.value)} />
              </label>
              <button type="submit" className="primary" disabled={isBusy || !user}>
                <Send size={18} />
                Отправить в мой браузер
              </button>
            </form>
          </section>
        </div>

        <footer className="notice">{status}</footer>
      </section>
    </main>
  );
}

async function api<T = unknown>(
  url: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(buildApiUrl(url), {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "Request failed");
  }

  return data;
}

function buildApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${apiBaseUrl}${path}`;
}

function supportsNotifications() {
  return "Notification" in window && typeof Notification.requestPermission === "function";
}

function getNotificationPermission(): NotificationStatus {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
