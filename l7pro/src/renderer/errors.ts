/** Toglie il prefisso che Electron aggiunge agli errori passati via IPC. */
export function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
