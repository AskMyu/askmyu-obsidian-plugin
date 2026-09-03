/**
 * Extension points for internal development builds.
 *
 * Release and community builds register nothing here — the arrays stay empty
 * and every consumer renders exactly what this repository shows. Internal
 * builds (the monorepo's dev loop and test harnesses) may register extra
 * affordances for their own tooling.
 */
import type { App } from 'obsidian';

export interface SignupDoorCtx {
  app: App;
  /** The plugin instance; typed loosely so this file stays dependency-free. */
  plugin: unknown;
  email(): string;
  close(): void;
  finished(): void;
}

/** Renderers invited into the signup modal's doors area, in order. */
export const signupDoors: Array<(host: HTMLElement, ctx: SignupDoorCtx) => void> = [];
