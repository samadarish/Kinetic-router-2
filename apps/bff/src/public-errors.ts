const INTERNAL_PRODUCT_NAME = /(?:sub\s*2\s*api|hao\s*\.?\s*ai|\bnewapi\b)/gi;
const INTERNAL_PRODUCT_CODE = /(?:SUB2API|HAOAI|NEWAPI)/i;
const INTERNAL_ERROR_DETAIL = /(?:json:\s*cannot\s+unmarshal|sqlstate|stack\s+trace|panic:|node_modules|\.go:\d+|github\.com\/|dial\s+(?:tcp|udp)|connection\s+(?:refused|reset)|\b(?:\d{1,3}\.){3}\d{1,3}:\d+\b|(?:[a-z]:\\|\/var\/|\/etc\/|\/srv\/))/i;

export function toPublicText(value: string, fallback: string, maxLength = 5_000) {
  const text = value.trim().replace(INTERNAL_PRODUCT_NAME, 'kineticRouter');
  return (text || fallback).slice(0, maxLength);
}

export function toPublicUpstreamMessage(message: string, status: number) {
  if (status <= 0 || status >= 500) return fallbackForStatus(status);
  const text = toPublicText(message, fallbackForStatus(status), 500);
  if (!INTERNAL_ERROR_DETAIL.test(text)) return text;
  return 'The submitted information is invalid. Check the fields and try again.';
}

export function toPublicErrorCode(code: string, status: number) {
  if (status >= 500) return 'ACCOUNT_SERVICE_UNAVAILABLE';
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(normalized) || INTERNAL_PRODUCT_CODE.test(normalized)) {
    return 'REQUEST_FAILED';
  }
  return normalized;
}

function fallbackForStatus(status: number) {
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'This action is not allowed for your account.';
  if (status === 404) return 'The requested item was not found.';
  if (status === 409) return 'The request conflicts with the current account state.';
  if (status === 429) return 'Too many requests. Try again shortly.';
  if (status >= 500) return 'The account service could not complete the request.';
  return 'The request could not be completed.';
}
