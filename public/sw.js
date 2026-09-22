self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "KLGCR notification", {
    body: data.body || "You have a new KLGCR notification.",
    icon: "/klg-campus-residence-logo.png",
    badge: "/klg-campus-residence-logo.png",
    data: { href: data.href || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const match = windows.find((client) => new URL(client.url).pathname === href);
    return match ? match.focus() : clients.openWindow(href);
  }));
});
