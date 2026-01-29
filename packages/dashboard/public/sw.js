// Service Worker for Hardex Dashboard
// Enables background price updates even when tab is not active

const CACHE_NAME = 'hardex-v1';
const API_URL = '/api/prices';
const PRICE_CACHE_KEY = 'hardex-prices';
const UPDATE_INTERVAL = 30000; // 30 seconds

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );

  // Start background updates
  startBackgroundUpdates();
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data.type === 'START_UPDATES') {
    console.log('[SW] Starting background updates');
    startBackgroundUpdates();
  } else if (event.data.type === 'STOP_UPDATES') {
    console.log('[SW] Stopping background updates');
    stopBackgroundUpdates();
  } else if (event.data.type === 'GET_PRICES') {
    // Return cached prices immediately
    getCachedPrices().then((prices) => {
      event.ports[0].postMessage({ type: 'PRICES', data: prices });
    });
  }
});

let updateIntervalId = null;

function startBackgroundUpdates() {
  if (updateIntervalId) return;

  // Initial fetch
  fetchAndBroadcast();

  // Set up interval
  updateIntervalId = setInterval(fetchAndBroadcast, UPDATE_INTERVAL);
}

function stopBackgroundUpdates() {
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
    updateIntervalId = null;
  }
}

async function fetchAndBroadcast() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Cache the prices
    await cachePrices(data);

    // Check for significant changes and show notification
    const prevPrices = await getCachedPrices();
    const significantChange = checkSignificantChange(prevPrices, data);

    if (significantChange) {
      showPriceNotification(significantChange);
    }

    // Broadcast to all clients
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'PRICE_UPDATE',
        data: data,
        timestamp: Date.now(),
      });
    });

    console.log('[SW] Price update broadcasted');
  } catch (error) {
    console.error('[SW] Failed to fetch prices:', error);
  }
}

async function cachePrices(prices) {
  const cache = await caches.open(CACHE_NAME);
  const response = new Response(JSON.stringify({
    prices,
    timestamp: Date.now(),
  }));
  await cache.put(PRICE_CACHE_KEY, response);
}

async function getCachedPrices() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(PRICE_CACHE_KEY);
    if (response) {
      const data = await response.json();
      return data.prices;
    }
  } catch (e) {
    // Ignore cache errors
  }
  return null;
}

function checkSignificantChange(oldPrices, newPrices) {
  if (!oldPrices || !newPrices) return null;

  const THRESHOLD = 0.02; // 2% change

  for (const [assetId, newData] of Object.entries(newPrices)) {
    const oldData = oldPrices[assetId];
    if (!oldData) continue;

    const oldPrice = oldData.price;
    const newPrice = newData.price;

    if (oldPrice && newPrice) {
      const changePercent = Math.abs(newPrice - oldPrice) / oldPrice;
      if (changePercent >= THRESHOLD) {
        return {
          assetId,
          oldPrice,
          newPrice,
          changePercent,
          direction: newPrice > oldPrice ? 'up' : 'down',
        };
      }
    }
  }

  return null;
}

async function showPriceNotification(change) {
  // Check if we have notification permission
  if (Notification.permission !== 'granted') return;

  const direction = change.direction === 'up' ? '📈' : '📉';
  const percent = (change.changePercent * 100).toFixed(2);

  const assetNames = {
    'GPU_RTX4090': 'RTX 4090',
    'GPU_RTX4080': 'RTX 4080',
    'GPU_RTX3090': 'RTX 3090',
    'RAM_DDR5_32': 'DDR5 32GB',
    'RAM_DDR5_64': 'DDR5 64GB',
  };

  const title = `${direction} ${assetNames[change.assetId] || change.assetId} Price Alert`;
  const body = `Price ${change.direction === 'up' ? 'increased' : 'decreased'} by ${percent}%\n$${change.oldPrice.toFixed(2)} → $${change.newPrice.toFixed(2)}`;

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `price-${change.assetId}`,
    renotify: true,
  });
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus existing window or open new one
      for (const client of clients) {
        if (client.url.includes('hardex') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    })
  );
});
