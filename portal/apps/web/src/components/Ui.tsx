import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { AlertCircle, LoaderCircle, SearchX } from 'lucide-react';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div>{action}</div>}</header>;
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <div className="state-panel"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><SearchX size={22} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return <div className="error-state"><AlertCircle size={22} /><div><strong>Couldn’t load this page</strong><p>{message}</p></div>{retry && <Button variant="secondary" onClick={retry}>Try again</Button>}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function StatCard({ label, value, helper, icon }: { label: string; value: ReactNode; helper?: string; icon: ReactNode }) {
  return <Card className="stat-card"><div className="stat-icon">{icon}</div><div><span className="stat-label">{label}</span><strong>{value}</strong>{helper && <small>{helper}</small>}</div></Card>;
}
