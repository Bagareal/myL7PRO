// Manual update check: one request to the GitHub releases API, only when the user presses the button.
export const RELEASES_URL = "https://github.com/Bagareal/myL7PRO/releases";
const LATEST_API = "https://api.github.com/repos/Bagareal/myL7PRO/releases/latest";

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  url: string;
}

/** "v1.0.3" or "1.0.3" to [1, 0, 3]; null when it is not a plain dotted version. */
export function parseVersion(text: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+){0,3})$/.exec(text.trim());
  return m ? m[1].split(".").map(Number) : null;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export async function checkForUpdate(current: string, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<UpdateInfo> {
  let body: unknown;
  try {
    const res = await fetchFn(LATEST_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "myL7PRO" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    body = await res.json();
  } catch {
    throw new Error("Could not reach GitHub. Check your connection and try again.");
  }
  const tag = typeof (body as { tag_name?: unknown })?.tag_name === "string" ? (body as { tag_name: string }).tag_name : "";
  if (!parseVersion(tag)) throw new Error("GitHub returned an unexpected answer.");
  // The page we open is always on our own repository, whatever the answer says.
  const page = (body as { html_url?: unknown }).html_url;
  const url = typeof page === "string" && page.startsWith(`${RELEASES_URL}/`) ? page : RELEASES_URL;
  return { current, latest: tag.replace(/^v/, ""), available: isNewer(tag, current), url };
}
