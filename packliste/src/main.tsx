import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { LocalStorageProvider } from "./data/LocalStorageProvider";
import { DataProviderRoot } from "./data/DataProviderContext";

const provider = new LocalStorageProvider();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProviderRoot provider={provider}>
      <App />
    </DataProviderRoot>
    <PWAUpdatePrompt />
  </StrictMode>,
);
