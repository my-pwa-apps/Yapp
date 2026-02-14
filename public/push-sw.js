/* push-sw.js — Web Push event handler
   Imported by the PWA service worker via workbox importScripts. */

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Yapp', body: event.data.text() };
  }

  var title = payload.title || 'Yapp';
  var isCall = payload.data && payload.data.type === 'call';

  var options = {
    body: payload.body || '',
    icon: '/Yapp/icons/icon-192.png',
    badge: '/Yapp/icons/icon-192.png',
    tag: (payload.data && payload.data.tag) || (isCall ? 'yapp-call' : 'yapp-message'),
    data: payload.data || {},
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [200, 100, 200, 100, 200, 100, 200] : [100, 50, 100],
  };

  if (isCall) {
    options.actions = [
      { action: 'answer', title: '\u{1F4DE} Answer' },
      { action: 'decline', title: '\u274C Decline' },
    ];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // If user clicked "Decline", just close
  if (event.action === 'decline') return;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Try to focus an existing Yapp window
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.indexOf('/Yapp') !== -1 && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new one
        return self.clients.openWindow('/Yapp/');
      })
  );
});
