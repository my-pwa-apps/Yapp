/* push-sw.js — Web Push event handler
   Imported by the PWA service worker via workbox importScripts.
  SW_VERSION: 21 */

/** Check if a client URL belongs to the Yapp app using proper URL parsing */
function isYappWindow(clientUrl) {
  try {
    var parsed = new URL(clientUrl);
    return parsed.pathname === '/Yapp/' || parsed.pathname.startsWith('/Yapp/');
  } catch (e) {
    return false;
  }
}

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.warn('[push-sw] Failed to parse push payload:', e);
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

  // Skip notification if a focused Yapp window exists (app is in foreground)
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: false })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if (isYappWindow(clientList[i].url) && clientList[i].focused) {
            // App is focused — forward push data to the app, skip OS notification
            clientList[i].postMessage({ type: 'PUSH_RECEIVED', payload: payload });
            return;
          }
        }
        return self.registration.showNotification(title, options);
      })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var isCall = data.type === 'call';

  // If user clicked "Decline" on a call, tell the app to reject it
  if (event.action === 'decline' && isCall) {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: false })
        .then(function (clientList) {
          for (var i = 0; i < clientList.length; i++) {
            if (isYappWindow(clientList[i].url)) {
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
      .matchAll({ type: 'window', includeUncontrolled: false })
      .then(function (clientList) {
        // Try to focus an existing Yapp window
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (isYappWindow(client.url) && 'focus' in client) {
            if (msg) client.postMessage(msg);
            return client.focus();
          }
        }
        // Otherwise open a new one — pass action as URL param so the app can pick it up
        var url = '/Yapp/';
        if (msg && msg.type === 'ANSWER_CALL') {
          url += '?answerCall=' + encodeURIComponent(msg.callId);
        } else if (msg && msg.type === 'OPEN_CHAT') {
          url += '?openChat=' + encodeURIComponent(msg.chatId);
        }
        return self.clients.openWindow(url);
      })
  );
});

self.addEventListener('notificationclose', function (event) {
  // Clean up state when notification is dismissed (e.g., ringing call)
  var data = event.notification.data || {};
  if (data.type === 'call') {
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: false })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if (isYappWindow(clientList[i].url)) {
            clientList[i].postMessage({ type: 'NOTIFICATION_CLOSED', data: data });
          }
        }
      });
  }
});
