// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Group, GroupModelCatalog } from '@kineticrouter/portal-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyGroupSelect } from './ApiKeyGroupSelect';
import { Modal } from './Modal';

const groups: Group[] = [{ id: '7', name: 'OpenAI', platform: 'openai' }, { id: '12', name: 'Moonshot', platform: 'openai' }];
const catalog: GroupModelCatalog = { revision: 1, groups: [
  { groupId: '7', provider: 'openai', models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-pro'] },
  { groupId: '12', provider: 'moonshot', models: ['kimi-k2.5'] },
] };
let root: Root;
let host: HTMLDivElement;
const onChange = vi.fn(), onClose = vi.fn();
let observations: Array<() => void>;

function Preview({ initial = '', preview = catalog, retained, disabled = false }: { initial?: string; preview?: GroupModelCatalog; retained?: Group; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return <Modal open title="Create API key" onClose={onClose}>
    <ApiKeyGroupSelect value={value} groups={groups} currentGroup={retained} catalog={preview} disabled={disabled} onChange={id => { onChange(id); setValue(id); }} />
    <button type="button">Next field</button>
  </Modal>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  observations = [];
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { observations.push(callback); } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.parentElement?.classList.contains('key-group-model-track') ? (this.textContent?.length ?? 0) * 6 : 350;
    return { width, height: 64, top: 100, bottom: this.classList.contains('modal-content') ? 600 : 164, left: 0, right: width, x: 0, y: 100, toJSON() {} };
  });
  onChange.mockClear(); onClose.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const trigger = () => host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
async function render(props: Parameters<typeof Preview>[0] = {}) {
  await act(async () => root.render(<Preview {...props} />));
  // Let the modal's initial-focus frame finish before simulating user input.
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
}
async function key(value: string) { await act(async () => { trigger().focus(); trigger().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); }); }
async function open() { await act(async () => trigger().click()); }

describe('API key group picker', () => {
  it('shows bundled company logos and the shared model list without auto-selecting a group', async () => {
    await render(); await open();
    const options = host.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);
    expect(options[0]?.querySelector('[data-provider-icon="openai"]')).not.toBeNull();
    expect(options[1]?.querySelector('[data-provider-icon="moonshot"]')).not.toBeNull();
    expect(options[0]?.textContent).toContain('gpt-5.4-mini');
    expect(options[1]?.textContent).not.toContain('gpt-5.4');
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger().getAttribute('aria-required')).toBe('true');
  });

  it('selects with the keyboard and lets Escape close the dropdown before closing its modal', async () => {
    await render(); await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
    expect(onChange).toHaveBeenLastCalledWith('12');
    expect(trigger().textContent).toContain('Moonshot');
    expect(host.querySelector<HTMLInputElement>('input[name="groupId"]')?.value).toBe('12');
    expect(document.activeElement).toBe(trigger());
    await open(); await key('Escape');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await key('Escape'); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports typeahead and closing with Tab or an outside pointer', async () => {
    await render(); await key('m'); await key('Enter');
    expect(onChange).toHaveBeenCalledWith('12');
    await open(); await key('Tab');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await open(); await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('scrolls only overflowing text and measures again after a resize', async () => {
    await render(); await open();
    const strips = host.querySelectorAll<HTMLElement>('.key-group-models');
    expect(strips[0]?.dataset.overflow).toBe('true');
    expect(strips[1]?.dataset.overflow).toBe('false');
    expect(strips[0]?.querySelector('.key-group-model-track')?.getAttribute('aria-hidden')).toBe('true');
    expect(strips[0]?.querySelector('.sr-only')?.textContent).toBe('gpt-5.4 · gpt-5.4-mini · gpt-5.4-pro');
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    await act(async () => { observations.forEach(observe => observe()); });
    expect(strips[0]?.dataset.overflow).toBe('false');
    expect(strips[0]?.querySelector('.key-group-model-duplicate')).toBeNull();
  });

  it('keeps groups selectable when previews are unavailable and preserves a retained current group', async () => {
    await render({ initial: '42', retained: { id: '42', name: 'Legacy plan' }, preview: { revision: 0, groups: [] } });
    expect(trigger().textContent).toContain('Legacy plan (current group)');
    expect(trigger().textContent).toContain('Model preview unavailable');
    await key('ArrowDown'); await key('End'); await key('Enter');
    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('does not open a disabled picker', async () => {
    await render({ disabled: true }); await open();
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
