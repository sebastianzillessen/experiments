/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />

declare global {
  interface Window {
    // Injected at deploy time by build.sh (config.js). The VAPID public key is
    // the application-server key passed to PushManager.subscribe(). It is public
    // by design, so embedding it in the build is fine.
    __APP_CONFIG?: { vapidPublicKey?: string };
    __APP_VERSION?: { commit?: string; builtAt?: string };
  }
}

export {};
