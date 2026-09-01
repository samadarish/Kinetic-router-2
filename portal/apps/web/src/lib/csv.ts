const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r\n]/;

export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safeText = SPREADSHEET_FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}
