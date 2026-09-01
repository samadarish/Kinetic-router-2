import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { consoleSignInDestination, publicRequestOrigin } from '@/data/console';
type Props = { params: Promise<{ slug?: string[] }> };
export default async function ConsoleRedirect({ params }: Props) { const { slug } = await params; const next = `/console/${slug?.join('/') ?? ''}`.replace(/\/$/, ''); redirect(consoleSignInDestination(next, publicRequestOrigin(await headers()))); }
