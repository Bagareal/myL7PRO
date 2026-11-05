// Starts electron-vite without ELECTRON_RUN_AS_NODE (set by VS Code: it would make Electron run as plain Node).
import { spawn } from "node:child_process";

delete process.env.ELECTRON_RUN_AS_NODE;
const child = spawn("npx", ["electron-vite", "dev"], { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
