import "@fontsource/syne/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Boot } from "./App";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
