import { createRoot } from "react-dom/client";

import { localizeDocument } from "../i18n";
import { PopupApp } from "./PopupApp";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz do popup não encontrado.");

localizeDocument();
createRoot(root).render(<PopupApp />);
