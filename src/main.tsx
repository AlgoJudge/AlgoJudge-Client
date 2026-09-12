import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import "./i18n";
// After `./i18n`, because it subscribes to it.
import "./seo";

import "@mantine/code-highlight/styles.css";

// The language is i18next's own (it detects and stores it) and the colour scheme
// is Mantine's. There is no provider of ours in between: two stores for one
// setting meant the last screen to mount decided what the reader saw.
/*
 * The service worker, and only where it is wanted.
 *
 * **Guarded on `PROD`, which is the whole of why the browser checks are
 * untouched.** `check:ui` and `check:mobile` run `npm run dev`, Playwright
 * allows service workers by default, and not one of the 55 scripts clears Cache
 * Storage — eighteen of them clear `localStorage` and `sessionStorage` by hand
 * and none touches `caches`. A worker registered in development would install
 * itself into every one of them.
 *
 * Failure is swallowed on purpose: a browser that refuses to register one has
 * lost an installable application, not a working one.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
