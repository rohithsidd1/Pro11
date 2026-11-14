// Pro11: phone push alerts (loaded into the app's service worker)
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: 'Pro11', body: event.data ? event.data.text() : '' } }
  const title = data.title || 'Pro11'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag || undefined,
    data: { link: data.link || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); if ('navigate' in w) { try { await w.navigate(link) } catch (e) { /* cross-origin */ } } return }
    }
    if (self.clients.openWindow) await self.clients.openWindow(link)
  })())
})
