import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { consoleSignInDestination, publicRequestOrigin } from '@/data/console';

export const metadata: Metadata = { title: { absolute: 'Sign in — kineticRouter' }, description: 'Sign in to the kineticRouter customer console.', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignInPage({ searchParams }: Props) {
  const requested = (await searchParams).next;
  const next = Array.isArray(requested) ? requested[0] : requested;
  redirect(consoleSignInDestination(next, publicRequestOrigin(await headers())));
}
