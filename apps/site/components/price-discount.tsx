import { discountRate, type Model } from '@/data/model-utils';

export function PriceDiscount({ model }: { model: Pick<Model, 'prices'> }) {
  const rate = discountRate(model);
  if (rate == null || rate >= 1) return null;
  return <span className="inline-flex shrink-0 items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{Math.round((1 - rate) * 100)}% off</span>;
}
