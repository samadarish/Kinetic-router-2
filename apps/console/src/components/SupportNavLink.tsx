import { MessageSquare } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { useSupport } from '../lib/support-context';

type SupportNavLinkProps = Pick<ReturnType<typeof useSupport>, 'presence' | 'connection' | 'unreadCount'> & {
  to: string;
};

export function SupportNavLink({ to, presence, connection, unreadCount }: SupportNavLinkProps) {
  const status = connection === 'connected' ? presence.status : 'unavailable';
  const description = connection === 'connected'
    ? `Support is ${presence.status === 'online' ? 'Online' : presence.status === 'away' ? 'Away' : 'Offline'}`
    : connection === 'reconnecting' ? 'Support status unavailable, reconnecting'
    : connection === 'connecting' ? 'Support status unavailable, connecting'
    : 'Support status unavailable';
  const label = `${description}${unreadCount > 0 ? `, ${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : ''}`;

  return <NavLink
    to={to}
    title={description}
    aria-label={label}
    className={({ isActive }) => `support-header-link support-nav-${status}${isActive ? ' active' : ''}`}
  >
    <MessageSquare size={18} aria-hidden="true" />
    <span className="support-header-label" aria-hidden="true">Support</span>
    <span className="support-nav-dot" aria-hidden="true" />
    {unreadCount > 0 && <span className="support-header-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
  </NavLink>;
}
