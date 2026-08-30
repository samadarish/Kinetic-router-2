type BrandProps = {
  className?: string;
  /** Backward-compatible while legacy callers are migrated. */
  markClassName?: string;
};

export function Brand({ className, markClassName }: BrandProps) {
  const isMark = Boolean(markClassName);
  const sizeClass = className ?? markClassName ?? 'w-[142px]';
  return (
    <span
      role="img"
      aria-label="kineticRouter"
      className={`${isMark ? 'brand-mark' : 'brand-wordmark'} ${sizeClass}`}
    />
  );
}
