import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { consoleSignUpDestination, publicRequestOrigin } from '@/data/console';

export default async function VerifyEmailPage() {
  redirect(consoleSignUpDestination(undefined, publicRequestOrigin(await headers())));
}
