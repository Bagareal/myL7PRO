/** Removes the prefix Electron adds to errors passed over IPC. */
export function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
