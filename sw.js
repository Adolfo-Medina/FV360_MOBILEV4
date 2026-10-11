/* FV360 offline service worker - caches only application assets, never user projects. */
const CACHE='fv360-mobile-shell-v1.0.2-project-files';
const CORE=['./','./index.html','./styles.css','./mobile.css','./app.js','./mobile.js','./archive.js','./project-files.js','./table-dxf-r12.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('fv360-mobile-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{const cached=await caches.match(event.request);if(cached)return cached;
 try{const net=await fetch(event.request);return net}catch{if(event.request.mode==='navigate')return (await caches.match('./index.html'))||Response.error();return Response.error()}})());
});
