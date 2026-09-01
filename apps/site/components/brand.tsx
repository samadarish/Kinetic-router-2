type BrandProps = {
  className?: string;
  markClassName?: string;
  wordmarkPath?: string;
  markPath?: string;
  label?: string;
};

export function Brand({ className, markClassName, wordmarkPath, markPath, label = 'kineticRouter' }: BrandProps) {
  const isMark = Boolean(markClassName);
  const sizeClass = className ?? markClassName ?? 'w-[142px]';
  const imagePath = isMark ? markPath : wordmarkPath;
  return (
    <span
      role="img"
      aria-label={label}
      className={`${isMark ? 'brand-mark' : 'brand-wordmark'} ${sizeClass}`}
      style={imagePath ? { backgroundImage: `url("${imagePath}")` } : undefined}
    />
  );
}
