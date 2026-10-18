import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { activeProviderIds, getProviderDisplayStatus } from '@kineticrouter/platform-config/providers';
import { getPublicModel, publicModelChoices } from '@kineticrouter/platform-config/models';
import { ProviderIcon } from './ProviderIcon';

export function IntegrationModelSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = getPublicModel(value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return activeProviderIds.flatMap((provider) => publicModelChoices.filter((model) => model.provider === provider &&
      (!normalized || `${model.name} ${model.id} ${getProviderDisplayStatus(provider).label}`.toLowerCase().includes(normalized))));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  function close() { setOpen(false); setQuery(''); trigger.current?.focus(); }
  function choose(modelId: string) { onChange(modelId); close(); }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (!filtered.length) return;
    if (event.key === 'Enter') { event.preventDefault(); choose(filtered[active]?.id ?? filtered[0]!.id); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      setActive((current) => event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 :
        (current + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
    }
  }

  return <div className="integration-model-select" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setQuery(''); }
  }}>
    <span id={`${id}-label`} className="integration-model-label">Choose a model</span>
    <button ref={trigger} type="button" className="integration-model-trigger" aria-labelledby={`${id}-label ${id}-value`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => {
        setActive(Math.max(0, filtered.findIndex((model) => model.id === value))); setOpen(!open); setQuery('');
      }} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, filtered.findIndex((model) => model.id === value))); setOpen(true); } }}>
      <ProviderIcon provider={selected.provider} size={19} /><span id={`${id}-value`}><strong>{selected.name}</strong><small>{selected.id}</small></span>
      <span className="provider-availability verified">Available</span><ChevronDown size={17} />
    </button>
    {open && <div className="integration-model-menu">
      <label className="integration-model-search"><Search size={16} /><input ref={input} value={query} role="combobox" aria-label="Search models"
        aria-expanded={true} aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined}
        placeholder="Search models or companies…" onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={keyboard} /></label>
      <div id={`${id}-list`} role="listbox" aria-label="Available models" className="integration-model-options" ref={list}>
        {activeProviderIds.map((provider) => {
          const choices = filtered.filter((model) => model.provider === provider);
          if (!choices.length) return null;
          const label = `${id}-group-${provider}`;
          return <div key={provider} role="group" aria-labelledby={label}>
            <div id={label} className="integration-model-group"><ProviderIcon provider={provider} size={16} />{getProviderDisplayStatus(provider).label}<span>{choices.length}</span></div>
            {choices.map((model) => {
              const index = filtered.indexOf(model);
              return <div key={model.id} id={`${id}-option-${index}`} role="option" aria-selected={value === model.id} data-active={active === index}
                className="integration-model-option" onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(model.id)}>
                <span><strong>{model.name}</strong><small>{model.id}</small></span>{value === model.id && <Check size={16} />}
              </div>;
            })}
          </div>;
        })}
        {!filtered.length && <p className="integration-model-empty" role="status">No models match “{query}”.</p>}
      </div>
    </div>}
  </div>;
}
