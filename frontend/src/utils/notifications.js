import API from '../api/axios';

// Helper to convert base64 VAPID public key to Uint8Array for PushManager
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported by this browser/environment.');
    return null;
  }

  try {
    // 1. Request Permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push notification permission denied.');
      return null;
    }

    // 2. Register Service Worker sw.js
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    
    // Wait until service worker is active
    if (registration.installing) {
      await new Promise((resolve) => {
        registration.installing.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') resolve();
        });
      });
    }

    // 3. Fetch VAPID public key from backend
    const res = await API.get('/notifications/vapid-public-key');
    const vapidPublicKey = res.data.publicKey;
    if (!vapidPublicKey) {
      throw new Error('VAPID public key not found from backend');
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    // 4. Subscribe to Push Manager
    let subscription = await registration.pushManager.getSubscription();
    
    // Re-subscribe to make sure we are using the correct server key and update backend
    if (subscription) {
      await subscription.unsubscribe().catch(() => {});
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    // Convert subscription to JSON to get keys properly formatted
    const subscriptionJSON = subscription.toJSON();

    // 5. Send subscription payload to the backend
    await API.post('/notifications/subscribe', { subscription: subscriptionJSON });
    console.log('📲 Browser push notifications registered successfully.');
    return subscription;
  } catch (err) {
    console.error('❌ Failed to register push notifications:', err);
    return null;
  }
}
