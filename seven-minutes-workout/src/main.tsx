import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PWAUpdatePrompt />
  </StrictMode>,
);
