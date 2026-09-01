import { describe, expect, it } from 'vitest';
import { csvCell } from '../apps/web/src/lib/csv';

describe('CSV cell encoding', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1+1', "'+1+1"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\t=1+1', "'\t=1+1"],
    ['\n=1+1', '"\'\n=1+1"'],
  ])(
    'neutralizes spreadsheet formula prefix %j',
    (value, expected) => {
      expect(csvCell(value)).toBe(expected);
    },
  );

  it('quotes carriage returns and neutralizes a leading carriage return', () => {
    expect(csvCell('line one\rline two')).toBe('"line one\rline two"');
    expect(csvCell('\r=1+1')).toBe('"\'\r=1+1"');
  });

  it('escapes quotes and commas without changing ordinary values', () => {
    expect(csvCell('alpha,"beta"')).toBe('"alpha,""beta"""');
    expect(csvCell('plain text')).toBe('plain text');
    expect(csvCell(42)).toBe('42');
  });
});
