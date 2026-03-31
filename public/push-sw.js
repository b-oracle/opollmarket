// Push notification service worker handler
// This runs in the existing service worker context

// Aimtell push SDK — integrated here so it shares the PWA's service worker scope
// (a separate aimtell-worker.js can't register because the PWA worker already owns "/")
try {
  importScripts('https://cdn.aimtell.com/sdk/aimtell-worker-sdk.js');
} catch (e) {
  // Silent — don't break VAPID push if Aimtell CDN is unavailable
}

self.addEventListener("push", (event) => {
  let data = { title: "OPOLL", body: "You have a new notification", url: "/" };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // fallback to defaults
  }

  const options = {
    body: data.body,
    icon: "/logo.png",
    badge: "/logo.png",
    vibrate: [200, 100, 200],
    data: { url: data.url },
    actions: [{ action: "open", title: "View" }],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
