/// <reference types="vite/client" />
import type { L7Api } from "../shared/api.js";

declare global {
  interface Window {
    l7: L7Api;
  }
}
