import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { menuFocusIndex, RowActionsMenu } from './RowActionsMenu';

describe('key actions menu', () => {
  it('renders an explicitly labelled menu trigger without performing an action', () => {
    const select = vi.fn();
    const html = renderToStaticMarkup(<RowActionsMenu label="Actions for Production" items={[{ label: 'Disable key', onSelect: select }]} />);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Actions for Production"');
    expect(select).not.toHaveBeenCalled();
    expect(html).not.toContain('role="menuitem"');
  });

  it('supports wrapping arrow navigation and Home/End', () => {
    expect(menuFocusIndex('ArrowDown', 2, 3)).toBe(0);
    expect(menuFocusIndex('ArrowUp', 0, 3)).toBe(2);
    expect(menuFocusIndex('Home', 2, 3)).toBe(0);
    expect(menuFocusIndex('End', 0, 3)).toBe(2);
    expect(menuFocusIndex('ArrowDown', 0, 0)).toBe(-1);
  });
});
