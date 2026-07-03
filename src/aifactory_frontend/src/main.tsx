import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { ThemeProvider } from "./app/utils/theme";

import "./styles/index.css";
import "./styles/tailwind.css";
import "./styles/theme.css";
import "./styles/fonts.css";
import "./styles/global.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
