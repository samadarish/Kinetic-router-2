import Link from 'next/link';
import type { ComponentProps } from 'react';
export function SiteLink({ href = '', ...props }: ComponentProps<'a'>) {
 return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/account/') && !props.download ? <Link href={href} {...props} /> : <a href={href} {...props} />;
}
