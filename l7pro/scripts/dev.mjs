// Avvia electron-vite senza ELECTRON_RUN_AS_NODE (impostata da VS Code: farebbe girare Electron come semplice Node).
import { spawn } from "node:child_process";

delete process.env.ELECTRON_RUN_AS_NODE;
const child = spawn("npx", ["electron-vite", "dev"], { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
