import { redirect } from 'next/navigation';
type Props = { params: Promise<{ slug?: string[] }> };
export default async function ConsoleRedirect({ params }: Props) { const { slug } = await params; const next = `/console/${slug?.join('/') ?? ''}`.replace(/\/$/, ''); redirect(`https://console.kineticrouter.com/sign-in?next=${encodeURIComponent(next)}`); }
