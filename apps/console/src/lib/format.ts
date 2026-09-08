const moneyFormatters = new Map<number, Intl.NumberFormat>();
const numberFormatters = {
  standard: new Intl.NumberFormat('en-US', { notation: 'standard', maximumFractionDigits: 1 }),
  compact: new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }),
};
const dateFormatters = {
  date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  time: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
};

export function formatMoney(value: string | number | null | undefined, digits = 2) {
  const number = Number(value ?? 0);
  let formatter = moneyFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits });
    moneyFormatters.set(digits, formatter);
  }
  return formatter.format(Number.isFinite(number) ? number : 0);
}

export function formatOptionalMoney(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  return formatMoney(value, digits);
}

export function formatNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return numberFormatters[Math.abs(number) >= 1_000_000 ? 'compact' : 'standard'].format(Number.isFinite(number) ? number : 0);
}

export function formatDate(value?: string | null, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatters[includeTime ? 'time' : 'date'].format(date);
}

export function formatLatency(value?: number | null) {
  if (value === undefined || value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}
