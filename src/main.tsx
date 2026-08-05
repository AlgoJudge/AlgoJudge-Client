import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import "./i18n";

import "@mantine/code-highlight/styles.css";

// The language is i18next's own (it detects and stores it) and the colour scheme
// is Mantine's. There is no provider of ours in between: two stores for one
// setting meant the last screen to mount decided what the reader saw.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
