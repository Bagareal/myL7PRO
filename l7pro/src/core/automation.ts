import type { Snapshot } from "../shared/api.js";
import { exeName, pickSlot, type Match } from "./rules.js";
import type { Settings } from "./settings.js";

/** The part of MouseService that automation needs. */
export interface ProfileMouse {
  snapshot(): Snapshot;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  setProfile(p: number): Promise<void>;
}

export interface AutomationState {
  /** Last stable foreground program (ignores the myL7PRO window and unknown values). */
  foreground: string | null;
  match: Match;
  /** A manual change is in effect: automation waits for the foreground app to change. */
  hold: boolean;
}

interface Deps {
  mouse: ProfileMouse;
  getForeground: () => Promise<string | null>;
  getSettings: () => Settings;
  /** Programs that must never change the profile (for example the app itself). */
  ignoreExes: string[];
}

export class Automation {
  private stable: string | null = null;
  private candidate: string | null = null;
  private candidateSince = 0;
  private hold = false;
  private inflight = false;
  private ticking = false;
  private lastRequested: number | null = null;
  private prevProfile: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offSnapshot: (() => void) | null = null;
  private listeners: Array<(s: AutomationState) => void> = [];
  private lastEmitted = "";
  private readonly pollMs: number;
  private readonly stableMs: number;
  private readonly ignore: string[];

  constructor(
    private deps: Deps,
    opts: { pollMs?: number; stableMs?: number } = {},
  ) {
    this.pollMs = opts.pollMs ?? 1000;
    this.stableMs = opts.stableMs ?? 500;
    this.ignore = deps.ignoreExes.map(exeName);
  }

  start(): void {
    if (this.timer) return;
    const snap = this.deps.mouse.snapshot();
    this.prevProfile = snap.connection === "connected" && snap.state ? snap.state.profile : null;
    this.offSnapshot = this.deps.mouse.onSnapshot((s) => this.onSnapshot(s));
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.offSnapshot?.();
    this.offSnapshot = null;
  }

  state(): AutomationState {
    return { foreground: this.stable, match: pickSlot(this.stable, this.deps.getSettings()), hold: this.hold };
  }

  onState(fn: (s: AutomationState) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** The user picked a profile by hand: automation waits for the foreground app to change. */
  noteManualChange(): void {
    this.hold = true;
    this.emit();
  }

  /** The rules changed: apply them again right away for the current app. */
  refresh(): void {
    this.emit();
    void this.reconcile();
  }

  private emit(): void {
    const s = this.state();
    const key = JSON.stringify(s);
    if (key === this.lastEmitted) return;
    this.lastEmitted = key;
    for (const l of [...this.listeners]) l(s);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      let fg: string | null = null;
      try {
        fg = await this.deps.getForeground();
      } catch {
        fg = null;
      }
      const name = fg ? exeName(fg) : null;
      if (name && !this.ignore.includes(name)) {
        if (name !== this.candidate) {
          this.candidate = name;
          this.candidateSince = Date.now();
        }
        if (name !== this.stable && Date.now() - this.candidateSince >= this.stableMs) {
          this.stable = name;
          this.hold = false;
        }
      }
      this.emit();
      await this.reconcile();
    } finally {
      this.ticking = false;
    }
  }

  private onSnapshot(s: Snapshot): void {
    if (s.connection !== "connected" || !s.state) {
      this.prevProfile = null;
    } else {
      const p = s.state.profile;
      if (this.prevProfile !== null && p !== this.prevProfile && !this.inflight && p !== this.lastRequested) {
        this.hold = true; // the change was made by the mouse itself
        this.emit();
      }
      this.prevProfile = p;
    }
    void this.reconcile();
  }

  /** Moves the mouse to the right slot for the current app, only if needed and only if the mouse answers. */
  private async reconcile(): Promise<void> {
    if (this.hold || this.inflight || this.stable === null) return;
    const snap = this.deps.mouse.snapshot();
    if (snap.connection !== "connected" || !snap.state) return;
    const settings = this.deps.getSettings();
    if (settings.rules.length === 0) return; // no rules: automation never touches the mouse
    const desired = pickSlot(this.stable, settings).slot;
    if (snap.state.profile === desired) return;
    this.inflight = true;
    this.lastRequested = desired;
    try {
      await this.deps.mouse.setProfile(desired);
    } catch {
      /* the mouse did not answer: try again on the next round */
    } finally {
      this.inflight = false;
    }
  }
}
