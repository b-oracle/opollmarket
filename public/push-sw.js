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

  const isCall = data.is_call === true || (data.title && data.title.includes("Incoming Call"));

  const options = {
    body: data.body,
    icon: "/logo.png",
    badge: "/logo.png",
    data: { url: data.url, is_call: isCall, call_id: data.call_id },
    tag: isCall ? "incoming-call" : undefined,
    renotify: isCall,
    requireInteraction: isCall,
    vibrate: isCall
      ? [300, 200, 300, 200, 300, 200, 300, 200, 300, 200, 300]
      : [200, 100, 200],
    actions: isCall
      ? [
          { action: "answer", title: "Answer" },
          { action: "decline", title: "Decline" },
        ]
      : [{ action: "open", title: "View" }],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const isCall = event.notification.data?.is_call;
  const url = event.notification.data?.url || "/";

  // For decline action, just close the notification
  if (action === "decline") {
    return;
  }

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