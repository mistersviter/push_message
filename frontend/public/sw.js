self.addEventListener("push", (event) => {
  let payload = {
    title: "push_message",
    body: "New notification",
    icon: "/icon.svg",
    data: { url: "/" }
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      data: payload.data
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === url);
      if (existing) {
        return existing.focus();
      }

      return self.clients.openWindow(url);
    })
  );
});
