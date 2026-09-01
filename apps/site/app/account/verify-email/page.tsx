import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { consoleSignInDestination, publicRequestOrigin } from '@/data/console';

export default async function VerifyEmailPage() {
  redirect(consoleSignInDestination(undefined, publicRequestOrigin(await headers())));
}
