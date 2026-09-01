type BrandProps = { mark?: boolean; className?: string };

export function Brand({ mark = false, className = '' }: BrandProps) {
  return <span role="img" aria-label="kineticRouter" className={`${mark ? 'brand-mark' : 'brand-wordmark'} ${className}`} />;
}
