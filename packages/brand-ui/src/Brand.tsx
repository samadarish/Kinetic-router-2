import type { CSSProperties, HTMLAttributes } from 'react';
import { PRODUCT } from '@kineticrouter/platform-config/brand';

export type BrandVariant = 'wordmark' | 'mark';
export type BrandProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  variant?: BrandVariant;
  mark?: boolean;
  markClassName?: string;
  wordmarkPath?: string;
  markPath?: string;
  label?: string;
  decorative?: boolean;
};

export function Brand({
  variant,
  mark = false,
  markClassName,
  wordmarkPath,
  markPath,
  label = PRODUCT.name,
  decorative = false,
  className = '',
  style,
  ...props
}: BrandProps) {
  const resolvedVariant = variant ?? (mark || Boolean(markClassName) ? 'mark' : 'wordmark');
  const sizeClass = className || markClassName || (resolvedVariant === 'wordmark' ? 'w-[142px]' : '');
  const imagePath = resolvedVariant === 'mark' ? markPath : wordmarkPath;
  const imageStyle: CSSProperties | undefined = imagePath ? { backgroundImage: `url("${imagePath}")`, ...style } : style;
  return <span
    {...props}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : label}
    aria-hidden={decorative || undefined}
    className={`${resolvedVariant === 'mark' ? 'brand-mark' : 'brand-wordmark'}${sizeClass ? ` ${sizeClass}` : ''}`}
    style={imageStyle}
  />;
}
