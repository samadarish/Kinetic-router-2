import { discountRate, type Model } from '@/data/model-utils';

export function PriceDiscount({ model }: { model: Pick<Model, 'prices'> }) {
  const rate = discountRate(model);
  if (rate == null || rate >= 1) return null;
  const percent = Math.round((1 - rate) * 100);
  return <span aria-label={`${percent}% off`} className="price-discount inline-flex shrink-0 items-center rounded-full border bg-green-700/10 px-2 py-1 text-[10px] font-semibold text-green-700 dark:bg-green-400/10 dark:text-green-400">-{percent}%</span>;
}
