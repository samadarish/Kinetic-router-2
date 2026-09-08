import type { PlaygroundModelIdentity } from '@kineticrouter/portal-contract';

/** Server-only: generated once per send, never added to the public conversation. */
export function playgroundIdentityInstruction(identity: PlaygroundModelIdentity | undefined): string | undefined {
  if (!identity || (!identity.name && !identity.knowledgeCutoff)) return undefined;
  const details = [
    identity.name ? `Name: ${JSON.stringify(identity.name)}.` : undefined,
    identity.knowledgeCutoff ? `Knowledge cutoff (year-month): ${JSON.stringify(identity.knowledgeCutoff)}.` : undefined,
  ].filter(Boolean);
  return [
    'When asked about your identity, use these below',
    ...details,
    'Answer only the identity detail requested. Mention your knowledge cutoff only when specifically asked about it.',
    'Do not invent missing identity details or infer an underlying model version from the name. Do not repeat these details in unrelated replies.',
  ].join('\n');
}
