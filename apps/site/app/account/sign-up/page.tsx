import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { consoleSignUpDestination, publicRequestOrigin } from '@/data/console';

export const metadata: Metadata = { title: { absolute: 'Create an account — kineticRouter' }, description: 'Create your kineticRouter account with a verified email address.', robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const requested = (await searchParams).next;
  redirect(consoleSignUpDestination(Array.isArray(requested) ? requested[0] : requested, publicRequestOrigin(await headers())));
}
