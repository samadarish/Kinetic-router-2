export type PublicLogoutRequestOptions = {
  fetchImpl?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export function requestPublicLogout(
  consoleOrigin: string,
  options?: PublicLogoutRequestOptions,
): Promise<void>;
