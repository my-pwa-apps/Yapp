// Push notification handler — imported into the generated service worker via workbox importScripts.
// Handles FCM data-only pushes (background notifications) and notification click routing.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Yappin'", body: event.data.text() };
  }

  // FCM wraps data-only messages in a `data` field
  const data = payload.data || payload;
  const notification = payload.notification || {};

  const title = notification.title || data.title || "Yappin'";
  const body = notification.body || data.body || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      // If the app is focused and this is a message notification, the in-app RTDB
      // listener already shows it — skip duplicate.
      const isFocused = clients.some((c) => c.visibilityState === 'visible');
      if (isFocused && data.type === 'message') return;

      await self.registration.showNotification(title, {
        body,
        icon: '/Yapp/icons/icon-192.png',
        badge: '/Yapp/icons/icon-192.png',
        tag: data.tag || 'yapp-' + Date.now(),
        data: { chatId: data.chatId, type: data.type },
        vibrate: [200, 100, 200],
        renotify: true,
        requireInteraction: false,
      });

      // Update app icon badge count (works on Android & iOS installed PWAs)
      if ('setAppBadge' in self.navigator) {
        const notifications = await self.registration.getNotifications();
        self.navigator.setAppBadge(notifications.length).catch(() => {});
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const urlPath = '/Yapp/';

  event.waitUntil(
    (async () => {
      // Update badge count after dismissing this notification
      if ('setAppBadge' in self.navigator) {
        const remaining = await self.registration.getNotifications();
        if (remaining.length > 0) {
          self.navigator.setAppBadge(remaining.length).catch(() => {});
        } else {
          self.navigator.clearAppBadge().catch(() => {});
        }
      }

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing app window if one is open
      for (const client of clients) {
        if (client.url.includes('/Yapp/') && 'focus' in client) {
          client.focus();
          // Tell the app which chat to open
          if (data.chatId) {
            client.postMessage({ type: 'OPEN_CHAT', chatId: data.chatId });
          }
          return;
        }
      }
      // No window open — launch a new one
      return self.clients.openWindow(urlPath);
    })()
  );
});
