import { createRoot } from "react-dom/client";
import App from "./App";

import "./styles/tokens.css";
import "./styles/board.css";
import "./styles/notif.css";

createRoot(document.getElementById("root")!).render(<App />);
