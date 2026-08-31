import { createRoot } from "react-dom/client";

import { PopupApp } from "./PopupApp";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz do popup não encontrado.");

createRoot(root).render(<PopupApp />);
