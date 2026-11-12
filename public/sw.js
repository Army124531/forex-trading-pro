// Forex Trading Pro — Web Push service worker (Phase 1, v9.7).
// Site band ho tab bhi signal notification dikhata hai.
// Sound: browser / phone ki DEFAULT notification sound bajti hai —
// web push me custom sound nahi hoti, is liye koi sound file nahi.
const SITE_URL = 'https://forextradingprosignals.com';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = (data && data.title) || 'Forex Trading Pro';
  const body = (data && data.body) || 'Naya signal — Terminal khol kar dekhein.';
  const options = {
    body: body,
    tag: 'ftp-signal', // naya signal purani notification ko replace karta hai
    requireInteraction: false,
    data: { url: (data && data.url) || SITE_URL, code: (data && data.code) || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || SITE_URL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url && client.url.indexOf(new URL(url, self.location.origin).origin) === 0) {
          if (client.focus) client.focus();
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
