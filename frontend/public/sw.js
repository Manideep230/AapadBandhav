self.addEventListener('push', function(event) {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'AapadBandhav Emergency Alert';
    const options = {
      body: payload.body || 'New update received.',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200, 100, 200, 100, 400],
      data: payload.data || {},
      tag: payload.data?.accidentId || 'aapadbandhav-alert',
      renotify: true
    };
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('Push event parse error:', err);
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('AapadBandhav Platform Alert', {
        body: text,
        icon: '/favicon.ico',
        vibrate: [200, 100, 200]
      })
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const data = event.notification.data || {};
  
  // Choose URL to redirect to
  let targetUrl = '/';
  if (data.routeId) {
    targetUrl = `/navigation/${data.routeId}`;
  } else if (data.accidentId) {
    targetUrl = `/dashboard`;
  } else if (data.url) {
    targetUrl = data.url;
  } else {
    targetUrl = '/dashboard';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, try to focus it and navigate to targetUrl
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          // If we want to navigate it
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
