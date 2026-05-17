import { createRoot } from "react-dom/client";
import App from "./App";
import { registerSW } from "./lib/swUpdate";

import "./styles/tokens.css";
import "./styles/board.css";
import "./styles/notif.css";

registerSW();

createRoot(document.getElementById("root")!).render(<App />);
