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
  let data = { title: "OPollmarket", body: "You have a new notification", url: "/" };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // fallback to defaults
  }

  const isCall =
    data.is_call === true ||
    (typeof data.title === "string" && data.title.includes("Incoming Call"));

  const options = {
    body: data.body,
    icon: "/logo.png",
    badge: "/logo.png",
    data: {
      url: data.url,
      is_call: isCall,
      call_id: data.call_id,
    },
    tag: isCall ? `incoming-call-${data.call_id || "x"}` : undefined,
    renotify: isCall,
    requireInteraction: isCall,
    silent: false,
    vibrate: isCall
      ? [300, 200, 300, 200, 300, 200, 300, 200, 300, 200, 300]
      : [200, 100, 200],
    actions: isCall
      ? [
          // Order matters on Android: first action shows on the LEFT.
          // We put Decline left + Accept right to mirror WhatsApp's layout.
          { action: "decline", title: "✕ Decline", icon: "/icons/call-decline.png" },
          { action: "answer", title: "✓ Accept", icon: "/icons/call-accept.png" },
        ]
      : [{ action: "open", title: "View" }],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Build a URL that will auto-accept (or pre-decline) the call once the chat
// loads. IncomingCallBanner reads ?auto_accept=1&call_id=… and immediately
// invokes the same answer flow as tapping the in-app banner.
function buildCallUrl(baseUrl, callId, action) {
  try {
    const u = new URL(baseUrl, self.location.origin);
    if (action === "answer") {
      u.searchParams.set("auto_accept", "1");
      if (callId) u.searchParams.set("call_id", callId);
    } else if (action === "decline") {
      if (callId) u.searchParams.set("decline_call_id", callId);
    }
    return u.pathname + u.search + u.hash;
  } catch {
    return baseUrl || "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const isCall = event.notification.data?.is_call;
  const callId = event.notification.data?.call_id;
  const baseUrl = event.notification.data?.url || "/";

  // For non-call notifications, just open the URL.
  // For call notifications, EVERY tap (body, Accept, or Decline) needs to
  // bring the app to the foreground — even Decline, so the user can see
  // the call ended and reply if they want.
  const intent = isCall
    ? action === "decline"
      ? "decline"
      : "answer" // body tap or Accept → answer
    : "open";

  const targetUrl = isCall ? buildCallUrl(baseUrl, callId, intent) : baseUrl;

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Tell any already-open tab to act on the call immediately, then
      // navigate it. This avoids the SW losing the gesture chain when
      // client.navigate() is slow on Android Chrome.
      for (const client of windowClients) {
        if (!client.url.includes(self.location.origin)) continue;

        if (isCall) {
          try {
            client.postMessage({
              type: "dm-call-action",
              intent, // "answer" | "decline"
              call_id: callId,
              url: targetUrl,
            });
          } catch {
            // ignore postMessage failures
          }
        }

        try {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
        } catch {
          // some browsers reject cross-origin navigate — fall through
        }
        if ("focus" in client) {
          try {
            await client.focus();
          } catch {
            // ignore
          }
        }
        return;
      }

      // No open tab — open a fresh window straight at the deep link.
      await clients.openWindow(targetUrl);
    })()
  );
});
