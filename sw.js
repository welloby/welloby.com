/* Welloby's service worker: shows phone notifications and opens the right page when one is tapped.
   It does nothing else on purpose. There is no fetch handler and no cache, so every page still comes
   straight from the network. Keep the file name: a renamed worker leaves the old one running in
   browsers that already have it. */
const ROOT = new URL("./", self.location.href).href;   // the site's folder, wherever it is hosted

self.addEventListener("install", () => self.skipWaiting());   // a new version takes over at once; there is nothing cached to keep in step

/* The API sends { t: title, b: body, u: the page's route, tag: one per chat or thread }. A notification is shown
   whatever arrives: Safari takes the permission away from a site whose pushes show nothing. */
self.addEventListener("push", e => {
  let d = {};
  try { d = (e.data && e.data.json()) || {}; } catch (err) { d = {}; }
  const u = typeof d.u === "string" && d.u[0] === "/" ? d.u : "/messages";
  e.waitUntil(self.registration.showNotification(typeof d.t === "string" && d.t ? d.t : "Welloby", {
    body: typeof d.b === "string" ? d.b : "",
    icon: ROOT + "media/app-192.png",
    tag: typeof d.tag === "string" && d.tag ? d.tag : "welloby",
    renotify: true,   // a newer one with the same tag takes the old one's place; without this it would do so silently
    data: { u },
  }));
});

/* A tap goes to a Welloby tab that is already open (the community page first), which shows the chat or thread
   itself; with none open, the community page opens there. Tabs this worker doesn't control can't be sent to
   an address from here, so the tab gets a message and community-core.js does the moving. */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const u = (e.notification.data && e.notification.data.u) || "/messages";
  e.waitUntil((async () => {
    const tabs = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(t => t.url.startsWith(ROOT));
    const tab = tabs.find(t => /\/community(\.html)?$/.test(new URL(t.url).pathname)) || tabs[0];
    if (!tab) return self.clients.openWindow(ROOT + "community#" + u);
    tab.postMessage({ welloby: "open", u });
    return tab.focus();
  })());
});
