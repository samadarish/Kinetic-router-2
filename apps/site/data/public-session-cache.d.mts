import type { PublicSessionPresentation } from '@kineticrouter/portal-contract';
export type PublicSessionSnapshot = { loaded: boolean; session: PublicSessionPresentation | null; playgroundEnabled: boolean };
export const pendingPublicSession: PublicSessionSnapshot;
export function playgroundDestination(consoleOrigin: string, session?: PublicSessionPresentation | null): string;
export function createPublicSessionCache(consoleOrigin: string, options?: { fetchImpl?: typeof fetch; now?: () => number }): {
  getSnapshot(): PublicSessionSnapshot;
  subscribe(listener: () => void): () => void;
  watch(environment: { window: Window; document: Document }): () => void;
  refresh(): Promise<void>;
  signedOut(): void;
};
