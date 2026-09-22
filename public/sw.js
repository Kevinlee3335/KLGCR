self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const match = windows.find((client) => new URL(client.url).pathname === href);
    return match ? match.focus() : clients.openWindow(href);
  }));
});
