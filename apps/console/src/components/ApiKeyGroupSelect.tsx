import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Group, GroupModelCatalog } from '@kineticrouter/portal-contract';
import { resolveGroupProvider } from '@kineticrouter/platform-config/provider-resolution';
import { ProviderIcon } from './ProviderIcon';
import './group-select.css';

type Props = {
  value: string;
  groups: Group[];
  currentGroup?: Group;
  catalog?: GroupModelCatalog;
  loading?: boolean;
  disabled?: boolean;
  onChange(value: string): void;
};

export function ApiKeyGroupSelect({ value, groups, currentGroup, catalog, loading, disabled, onChange }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 280 });
  const typeahead = useRef({ value: '', at: 0 });
  const retained = currentGroup && !groups.some(group => group.id === currentGroup.id) ? currentGroup : undefined;
  const choices = retained ? [retained, ...groups] : groups;
  const selected = choices.find(group => group.id === value);

  function close() { setOpen(false); }
  function show(fromKeyboard = false, last = false) {
    const selectedIndex = choices.findIndex(group => group.id === value);
    setActive(selectedIndex >= 0 ? selectedIndex : last ? Math.max(0, choices.length - 1) : 0);
    setKeyboardActive(fromKeyboard);
    setOpen(true);
  }
  function choose(group: Group) { onChange(group.id); close(); trigger.current?.focus(); }

  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const container = root.current?.closest('.modal-content');
    const place = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const area = container?.getBoundingClientRect();
      const top = Math.max(area?.top ?? 0, 8);
      const bottom = Math.min(area?.bottom ?? window.innerHeight, window.innerHeight - 8);
      const below = Math.max(0, bottom - bounds.bottom - 6);
      const above = Math.max(0, bounds.top - top - 6);
      const desired = Math.min(menu.current?.scrollHeight || 280, 280);
      const up = below < desired && above > below;
      setPlacement({ above: up, maxHeight: Math.max(48, Math.floor(Math.min(280, up ? above : below))) });
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    if (root.current) observer?.observe(root.current);
    if (container) observer?.observe(container);
    window.addEventListener('resize', place);
    container?.addEventListener('scroll', place, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); container?.removeEventListener('scroll', place); };
  }, [open, choices.length]);
  useEffect(() => {
    if (open && keyboardActive) menu.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, keyboardActive]);

  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show(true, event.key === 'ArrowUp' || event.key === 'End');
        if (event.key === 'Home' || event.key === 'End') setActive(event.key === 'Home' ? 0 : Math.max(0, choices.length - 1));
      }
      else {
        setKeyboardActive(true);
        setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? Math.max(0, choices.length - 1)
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % Math.max(1, choices.length));
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && choices[active]) choose(choices[active]); else show(true);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      typeahead.current = { value: (now - typeahead.current.at < 800 ? typeahead.current.value : '') + event.key.toLowerCase(), at: now };
      const index = choices.findIndex(group => group.name.toLowerCase().startsWith(typeahead.current.value));
      setKeyboardActive(true); setOpen(true);
      if (index >= 0) setActive(index);
    }
  }

  function row(group: Group, selectedValue = false) {
    const entry = catalog?.groups.find(item => item.groupId === group.id);
    const provider = entry?.provider ?? resolveGroupProvider(group);
    const unavailable = !entry || provider === 'unknown';
    return <>
      <span className="key-group-logo"><ProviderIcon provider={provider} size={23} /></span>
      <span className="key-group-copy">
        <strong id={selectedValue ? `${id}-value` : undefined} translate="no">{group.name}{group.id === retained?.id ? ' (current group)' : ''}</strong>
        {entry?.models.length ? <ModelNames models={entry.models} /> : <span className="key-group-preview-state">{loading ? 'Loading models…' : unavailable ? 'Model preview unavailable' : 'No models selected'}</span>}
      </span>
    </>;
  }

  return <div className="field key-group-field">
    <span id={`${id}-label`}>Group</span>
    <div className="key-group-picker" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
      <input type="hidden" name="groupId" value={value} />
      <button ref={trigger} type="button" className="key-group-trigger" role="combobox" aria-required="true" disabled={disabled}
        aria-labelledby={`${id}-label ${selected ? `${id}-value` : `${id}-placeholder`}`} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && choices[active] ? `${id}-option-${active}` : undefined}
        onClick={() => open ? close() : show()} onKeyDown={keyboard}>
        {selected ? row(selected, true) : <span className="key-group-placeholder" id={`${id}-placeholder`}>Select a group</span>}
        <ChevronDown className="key-group-chevron" size={17} />
      </button>
      {open && <div ref={menu} className="key-group-menu" data-above={placement.above} style={{ maxHeight: placement.maxHeight }} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}>
        {choices.map((group, index) => <div key={group.id} id={`${id}-option-${index}`} role="option" aria-selected={value === group.id}
          className="key-group-option" data-active={index === active} data-keyboard-active={keyboardActive && index === active}
          onPointerDown={event => event.preventDefault()} onMouseMove={() => { setActive(index); setKeyboardActive(false); }} onClick={() => choose(group)}>
          {row(group)}{value === group.id && <Check className="key-group-check" size={16} />}
        </div>)}
        {!choices.length && <p className="key-group-empty" role="status">No groups available</p>}
      </div>}
    </div>
  </div>;
}

function ModelNames({ models }: { models: string[] }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  const names = models.join(' · ');
  useLayoutEffect(() => {
    const measure = () => {
      const width = text.current?.getBoundingClientRect().width ?? 0;
      const available = viewport.current?.clientWidth ?? 0;
      setDistance(available > 0 && width > available + 1 ? width + 24 : 0);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    if (viewport.current) observer?.observe(viewport.current);
    if (text.current) observer?.observe(text.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [names]);
  const style = { '--model-scroll-distance': `${distance}px`, '--model-scroll-duration': `${Math.max(12, distance / 24)}s` } as CSSProperties;
  return <span className="key-group-models" ref={viewport} data-overflow={distance > 0} title={names} translate="no">
    <span key="accessible" className="sr-only">{names}</span>
    <span key="visual" className="key-group-model-track" style={style} aria-hidden="true">
      <span ref={text}>{names}</span>{distance > 0 && <span className="key-group-model-duplicate">{names}</span>}
    </span>
  </span>;
}
