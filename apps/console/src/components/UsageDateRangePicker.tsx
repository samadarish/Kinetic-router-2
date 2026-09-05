import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown } from 'lucide-react';
import { Button } from './Ui';

export type UsageDateRange = {
  startDate: string;
  endDate: string;
  label: string;
};

type Preset = {
  id: string;
  label: string;
  getRange: (timezone: string) => Omit<UsageDateRange, 'label'>;
};

const presets: Preset[] = [
  { id: 'today', label: 'Today', getRange: (timezone) => rangeFromOffsets(0, 0, timezone) },
  { id: 'yesterday', label: 'Yesterday', getRange: (timezone) => rangeFromOffsets(1, 1, timezone) },
  { id: 'last-24-hours', label: 'Last 24 Hours', getRange: (timezone) => rangeFromOffsets(1, 0, timezone) },
  { id: 'last-7-days', label: 'Last 7 Days', getRange: (timezone) => rangeFromOffsets(6, 0, timezone) },
  { id: 'last-14-days', label: 'Last 14 Days', getRange: (timezone) => rangeFromOffsets(13, 0, timezone) },
  { id: 'last-30-days', label: 'Last 30 Days', getRange: (timezone) => rangeFromOffsets(29, 0, timezone) },
  { id: 'this-month', label: 'This Month', getRange: thisMonth },
  { id: 'last-month', label: 'Last Month', getRange: lastMonth },
];

export function getDefaultUsageRange(timezone = 'Asia/Kolkata'): UsageDateRange {
  return getUsagePresetRange('last-24-hours', timezone);
}

export function getUsagePresetRange(id: string, timezone = 'Asia/Kolkata'): UsageDateRange {
  const preset = presets.find((item) => item.id === id) ?? presets[2]!;
  return { ...preset.getRange(timezone), label: preset.label };
}

export default function UsageDateRangePicker({
  value,
  onApply,
  timezone = 'Asia/Kolkata',
  calendarOnly = false,
}: {
  value: UsageDateRange;
  onApply: (range: UsageDateRange) => void;
  timezone?: string;
  calendarOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(value.startDate);
  const [endDate, setEndDate] = useState(value.endDate);
  const [selectedPreset, setSelectedPreset] = useState(value.label);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstPresetRef = useRef<HTMLButtonElement>(null);
  const maxDate = calendarDateInTimezone(new Date(), timezone);
  const invalid = !startDate || !endDate || startDate > endDate;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const handleFocus = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    requestAnimationFrame(() => firstPresetRef.current?.focus());
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [open]);

  function openPicker() {
    setStartDate(value.startDate);
    setEndDate(value.endDate);
    setSelectedPreset(value.label);
    setOpen(true);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choosePreset(preset: Preset) {
    const range = preset.getRange(timezone);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setSelectedPreset(preset.label);
  }

  function apply() {
    if (invalid) return;
    onApply({
      startDate,
      endDate,
      label: selectedPreset || 'Custom Range',
    });
    close(true);
  }

  return <div className={`usage-range-picker${open ? ' open' : ''}`} ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="usage-range-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="usage-range-panel"
      onClick={() => open ? close(false) : openPicker()}
    >
      <CalendarDays size={16} />
      <span>{value.label}</span>
      <ChevronDown size={15} className={open ? 'range-chevron-open' : ''} />
    </button>
    {open && <>
      <button type="button" className="usage-range-backdrop" aria-label="Close time range picker" onClick={() => close(true)} />
      <div id="usage-range-panel" className="usage-range-panel" role="dialog" aria-label="Choose usage time range">
      <div className="usage-preset-grid" role="group" aria-label="Quick ranges">
        {presets.filter(preset => !calendarOnly || preset.id !== 'last-24-hours').map((preset, index) => <button
          ref={selectedPreset === preset.label || (!selectedPreset && index === 0) ? firstPresetRef : undefined}
          type="button"
          key={preset.id}
          className={selectedPreset === preset.label ? 'active' : ''}
          aria-pressed={selectedPreset === preset.label}
          onClick={() => choosePreset(preset)}
        >{preset.label}</button>)}
      </div>
      <div className="usage-custom-range">
        <label><span>Start Date</span><input type="date" value={startDate} max={endDate && endDate < maxDate ? endDate : maxDate} onChange={(event) => { setStartDate(event.target.value); setSelectedPreset(''); }} /></label>
        <span className="usage-date-arrow" aria-hidden="true"><ArrowRight size={15} /></span>
        <label><span>End Date</span><input type="date" value={endDate} min={startDate || undefined} max={maxDate} onChange={(event) => { setEndDate(event.target.value); setSelectedPreset(''); }} /></label>
      </div>
      <div className="usage-range-actions">
        <span className="usage-range-error" role="status" aria-live="polite">{invalid ? 'Choose a valid date range.' : ''}</span>
        <Button type="button" disabled={invalid} onClick={apply}>Apply</Button>
      </div>
    </div></>}
  </div>;
}

function rangeFromOffsets(startDaysAgo: number, endDaysAgo: number, timezone = 'Asia/Kolkata') {
  const today = parseCalendarDate(calendarDateInTimezone(new Date(), timezone));
  return {
    startDate: formatCalendarDate(addDays(today, -startDaysAgo)),
    endDate: formatCalendarDate(addDays(today, -endDaysAgo)),
  };
}

function thisMonth(timezone: string) {
  const today = parseCalendarDate(calendarDateInTimezone(new Date(), timezone));
  return {
    startDate: formatCalendarDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
    endDate: formatCalendarDate(today),
  };
}

function lastMonth(timezone: string) {
  const today = parseCalendarDate(calendarDateInTimezone(new Date(), timezone));
  return {
    startDate: formatCalendarDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))),
    endDate: formatCalendarDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))),
  };
}

function calendarDateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function parseCalendarDate(value: string) {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCalendarDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
