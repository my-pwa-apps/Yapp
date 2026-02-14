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
  var data = event.notification.data || {};
  var isCall = data.type === 'call';

  // If user clicked "Decline" on a call, tell the app to reject it
  if (event.action === 'decline' && isCall) {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(function (clientList) {
          for (var i = 0; i < clientList.length; i++) {
            if (clientList[i].url.indexOf('/Yapp') !== -1) {
              clientList[i].postMessage({ type: 'DECLINE_CALL', callId: data.callId });
            }
          }
        })
    );
    return;
  }

  // Determine the message to send to the app after focusing/opening
  var msg = null;
  if (isCall && (event.action === 'answer' || !event.action)) {
    msg = { type: 'ANSWER_CALL', callId: data.callId };
  } else if (data.chatId) {
    msg = { type: 'OPEN_CHAT', chatId: data.chatId };
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Try to focus an existing Yapp window
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.indexOf('/Yapp') !== -1 && 'focus' in client) {
            if (msg) client.postMessage(msg);
            return client.focus();
          }
        }
        // Otherwise open a new one — pass action as URL param so the app can pick it up
        var url = '/Yapp/';
        if (msg && msg.type === 'ANSWER_CALL') {
          url += '?answerCall=' + encodeURIComponent(msg.callId);
        }
        return self.clients.openWindow(url);
      })
  );
});
