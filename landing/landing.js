if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      if (new URL(registration.scope).pathname === '/') registration.unregister();
    });
  });
}
