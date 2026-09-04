import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Gift, History, Sparkles } from 'lucide-react';
import type { Redemption, RedeemResult, SessionView } from '@kineticrouter/portal-contract';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { jsonBody, portalApi } from '../lib/api';
import { formatDate, formatMoney, formatNumber } from '../lib/format';

export function RedeemPage() {
  const client = useQueryClient();
  const { capabilities } = useAuth();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const history = useQuery({
    queryKey: ['redemptions'],
    queryFn: ({ signal }) => portalApi<Redemption[]>('/redemptions', { signal }),
  });
  const redeem = useMutation({
    mutationFn: () => portalApi<RedeemResult>('/redemptions', {
      method: 'POST',
      ...jsonBody({ code: normalizeRedemptionCode(code) }),
    }),
    onSuccess: async (value) => {
      setResult(value);
      setCode('');
      client.setQueryData<SessionView>(['session'], (current) => {
        if (!current?.authenticated || !current.user) return current;
        return {
          ...current,
          user: {
            ...current.user,
            ...(value.newBalance !== undefined && value.newBalance !== null ? { balance: value.newBalance } : {}),
            ...(value.newConcurrency !== undefined ? { concurrency: value.newConcurrency } : {}),
          },
        };
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['redemptions'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['profile'] }),
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
      ]);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (redeem.isPending || !code.trim()) return;
    setResult(null);
    redeem.mutate();
  }

  return <>
    <PageHeader title="Redeem" description="Apply a kineticRouter balance, concurrency, or subscription code." />
    <div className="redeem-layout">
      <Card className="redeem-card">
        <span className="redeem-icon"><Gift size={25} /></span>
        <h2>Have a redemption code?</h2>
        <p>Codes are validated securely and applied to this account immediately.</p>
        {capabilities?.redeemWrites ? <form onSubmit={submit}>
          <input
            className="field-input redeem-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Enter your code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={redeem.isPending}
            required
          />
          <Button disabled={redeem.isPending || !code.trim()}>
            {redeem.isPending ? 'Redeeming…' : <><Sparkles size={16} /> Redeem code</>}
          </Button>
        </form> : <div className="info-banner inline"><Gift size={16} /><div><strong>Redemption is in read-only mode</strong><span>Code redemption is temporarily unavailable.</span></div></div>}
        {redeem.error && <div className="form-error">{redeem.error instanceof Error ? redeem.error.message : 'The code could not be redeemed.'}</div>}
        {result && <div className="redeem-success"><CheckCircle2 size={20} /><div><strong>{result.message}</strong><span>{result.type} · {formatRedemptionValue(result.type, result.value, result.validityDays)}{result.groupName ? ` · ${result.groupName}` : ''}</span></div></div>}
      </Card>
      <Card className="history-card">
        <div className="card-heading"><div><h2><History size={16} /> Redemption history</h2><p>Your 25 most recent codes.</p></div></div>
        {history.isLoading ? <LoadingState label="Loading history" /> : history.error ? <ErrorState error={history.error} retry={() => void history.refetch()} /> : !history.data?.length ? <EmptyState title="No redeemed codes" description="Codes used on this account will appear here." /> : <div className="redemption-list">{history.data.map((item) => <div key={item.id}><span className="redemption-badge"><Gift size={15} /></span><div><strong>{item.groupName || item.type}</strong><small>{formatDate(item.usedAt, true)}{item.code ? ` · ${item.code}` : ''}</small></div><div><strong>{formatRedemptionValue(item.type, item.value, item.validityDays ?? undefined)}</strong><Badge>{item.type}</Badge></div></div>)}</div>}
      </Card>
    </div>
  </>;
}

export function formatRedemptionValue(type: string, value: string, validityDays?: number) {
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes('balance') || normalizedType.includes('credit')) return formatMoney(value);
  if (normalizedType.includes('concurrency')) return `${formatNumber(value)} concurrent requests`;
  if (normalizedType.includes('subscription')) return validityDays ? `${formatNumber(validityDays)} days` : 'Subscription access';
  return formatNumber(value);
}

export function normalizeRedemptionCode(code: string) {
  return code.trim();
}
