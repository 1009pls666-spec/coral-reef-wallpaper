import { createRoot } from "react-dom/client";
import { CoralReef } from "../app/components/coral-reef";
import "../app/reef.css";
import "./page.css";

createRoot(document.getElementById("reef-root")!).render(<CoralReef />);
