import { keyQuota } from '../lib/key-quota';
import { formatMoney } from '../lib/format';

export function KeyQuota({ name, quota, used }: { name: string; quota?: string | null; used?: string | null }) {
  const value = keyQuota(quota, used);
  if (value.kind !== 'limited') return <div className="quota-cell">
    <span>{value.kind === 'unlimited' ? 'Unlimited' : 'Quota unavailable'}</span>
    <small>{value.used === undefined ? 'Usage unavailable' : `${formatMoney(value.used, 4)} used`}</small>
  </div>;
  const usageLabel = value.used === undefined ? 'Usage unavailable' : `${formatMoney(value.used, 4)} used`;
  return <div className="quota-cell">
    <span>{value.used === undefined ? '—' : formatMoney(value.used, 4)} <span className="quota-separator">/ {formatMoney(value.limit, 4)}</span></span>
    {value.percent === undefined ? <small>Usage unavailable</small> : <div
      className={`quota-progress${value.percent >= 100 ? ' quota-exhausted' : value.percent >= 80 ? ' quota-warning' : ''}`}
      role="progressbar"
      aria-label={`${name} quota used`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value.percent}
      aria-valuetext={`${usageLabel} of ${formatMoney(value.limit, 4)}`}
    ><span style={{ width: `${value.percent}%` }} /></div>}
  </div>;
}
