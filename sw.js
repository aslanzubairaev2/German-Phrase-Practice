const CACHE_NAME = 'german-srs-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  // App assets
  '/manifest.json',
  '/icon.svg',
  // Key external dependencies from the importmap
  'https://cdn.tailwindcss.com',
  'https://esm.sh/@google/genai@^1.15.0',
  'https://esm.sh/react@^19.1.1',
  'https://esm.sh/react-dom@^19.1.1',
  'https://esm.sh/react-markdown@^9.0.1',
  'https://esm.sh/remark-gfm@^4.0.0'
];

self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache).catch(error => {
          console.error('Failed to cache one or more essential resources during install:', error);
        });
      })
  );
});

self.addEventListener('fetch', event => {
  // We only want to cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // Return from cache if found
        if (response) {
          return response;
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(networkResponse => {
          // Check if we received a valid response
          if (networkResponse && networkResponse.status === 200) {
            // Clone the response because it's a stream and can only be consumed once.
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache);
          }
          return networkResponse;
        }).catch(error => {
            console.error('Fetching failed:', error);
            throw error;
        });
      });
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
