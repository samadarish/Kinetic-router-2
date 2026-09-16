const formatters = new Map<string, Intl.DateTimeFormat>();
const midnightFormatters = new Map<string, Intl.DateTimeFormat>();
const minuteFormatters = new Map<string, Intl.DateTimeFormat>();
export function localHour(at: number, timezone: string): string {
  let formatter = formatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); formatters.set(timezone, formatter); }
  const parts = formatter.formatToParts(at); const get = (key: string) => parts.find(part => part.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:00`;
}
export function addDays(day: string, count: number) { return new Date(Date.parse(day) + count * 86400000).toISOString().slice(0, 10); }
export function localMidnight(day: string, timezone: string): string {
  const target = Date.parse(`${day}T00:00:00Z`); let at = target;
  let formatter = midnightFormatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); midnightFormatters.set(timezone, formatter); }
  for (let i = 0; i < 3; i++) { const parts = formatter.formatToParts(at); const get = (key: string) => parts.find(part => part.type === key)!.value;
    const local = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`); at -= local - target;
  }
  return new Date(at).toISOString();
}
export function isHourStart(at: number, timezone: string) {
  if (at % 60000 !== 0) return false;
  let formatter = minuteFormatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en', { timeZone: timezone, minute: '2-digit' }); minuteFormatters.set(timezone, formatter); }
  return formatter.format(at) === '0';
}
export function monday(day: string) { return addDays(day, -(new Date(day).getUTCDay() + 6) % 7); }
export function chunks(start: string, end: string, days: number) {
  const result: Array<{ startDate: string; endDate: string }> = [];
  for (let day = start; day <= end;) { const last = [addDays(day, days - 1), end].sort()[0]!; result.push({ startDate: day, endDate: last }); day = addDays(last, 1); }
  return result;
}
