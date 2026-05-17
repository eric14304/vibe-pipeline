import { createRoot } from "react-dom/client";
import App from "./App";
import { registerSW } from "./lib/swUpdate";

import "./styles/tokens.css";
import "./styles/board.css";
import "./styles/notif.css";
import "./styles/swUpdate.css";

// vite dev mode serve raw SW source(含 ES module import)→ classic SW context 撞 SyntaxError(雷 #19)。
// 只在 production build(bun run preview)註冊 SW,dev mode skip。
if (import.meta.env.PROD) {
  registerSW();
}

createRoot(document.getElementById("root")!).render(<App />);
