import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BookOpen, ChevronDown, CircleGauge, CreditCard, Gift,
  KeyRound, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, PanelsTopLeft,
  Settings, Sun, UserRound, X,
} from 'lucide-react';
import { Brand } from './Brand';
import { useAuth } from '../lib/auth';
import { publicSiteHref } from '../lib/public-site';
import { useTheme } from '../lib/theme';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: CircleGauge },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/usage', label: 'Usage', icon: Activity },
  { to: '/status', label: 'Channel Status', icon: PanelsTopLeft },
  { to: '/subscriptions', label: 'My Subscriptions', icon: CreditCard },
  { to: '/redeem', label: 'Redeem', icon: Gift },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

const SIDEBAR_STORAGE_KEY = 'kineticrouter-sidebar-collapsed';

export function PortalShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarPreference);
  const { user, capabilities, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); setAccountOpen(false); }
    };
    const pointerdown = (event: PointerEvent) => {
      if (accountOpen && event.target instanceof Node && !accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('pointerdown', pointerdown);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('pointerdown', pointerdown); };
  }, [accountOpen]);

  useEffect(() => {
    if (!menuOpen) { document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>('.sidebar-close')?.focus());
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed)); } catch { /* Storage can be disabled. */ }
  }, [sidebarCollapsed]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await logout();
      navigate('/sign-in', { replace: true });
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  const accountName = user?.username || user?.email || 'kineticRouter user';
  const initials = accountName.slice(0, 1).toUpperCase();
  const visibleNav = nav.filter((item) => {
    if (item.to === '/status') return capabilities?.channelMonitor !== false;
    if (item.to === '/redeem') return capabilities?.promoCode !== false && user?.runMode !== 'simple';
    if (item.to === '/subscriptions') return user?.runMode !== 'simple';
    return true;
  });
  const consoleLinks = [
    { id: 'home', label: 'Home', href: '/dashboard' },
    { id: 'models', label: 'Model pricing', href: publicSiteHref('/models'), external: true },
    { id: 'docs', label: 'Docs', href: publicSiteHref('/docs'), external: true },
  ];

  return <div className={`portal-frame ${sidebarCollapsed ? 'portal-frame-collapsed' : ''}`}>
    <aside id="portal-navigation" ref={sidebarRef} className={`sidebar ${menuOpen ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <Brand className="sidebar-wordmark" />
        <span className="brand-mark sidebar-brand-mark" aria-hidden="true" />
        <button
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="icon-button sidebar-collapse"
          onClick={() => setSidebarCollapsed((value) => !value)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
        <button aria-label="Close menu" className="icon-button sidebar-close" onClick={() => setMenuOpen(false)}><X size={19} /></button>
      </div>

      <button className="personal-account" onClick={() => navigate('/profile')} title={sidebarCollapsed ? 'Personal Account' : undefined}>
        <span className="personal-account-icon"><UserRound size={17} /></span>
        <span className="personal-account-copy"><small>Personal Account</small><strong>{accountName}</strong></span>
        <ChevronDown className="personal-account-chevron" size={14} />
      </button>

      <nav className="sidebar-nav" aria-label="Customer portal">
        <span className="nav-eyebrow">Workspace</span>
        {visibleNav.map(({ to, label, icon: Icon }) => <NavLink
          key={to}
          to={to}
          title={sidebarCollapsed ? label : undefined}
          aria-label={sidebarCollapsed ? label : undefined}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        ><Icon size={17} strokeWidth={1.9} /><span>{label}</span></NavLink>)}
      </nav>

      <div className="sidebar-bottom">
        <a className="nav-link" href={publicSiteHref('/docs')} target="_blank" rel="noreferrer" title={sidebarCollapsed ? 'Documentation' : undefined}><BookOpen size={17} /><span>Documentation</span></a>
        <button className="nav-link theme-nav" onClick={toggle} title={sidebarCollapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

    <section className="portal-main">
      <header className="topbar">
        <button className="icon-button menu-button" aria-label="Open menu" aria-controls="portal-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        <div className="mobile-brand"><Brand className="mobile-wordmark" /></div>
        <nav className="console-topnav" aria-label="Console links">
          {consoleLinks.map((item) => isPortalRoute(item.href)
            ? <NavLink key={item.id} to={item.href} className={({ isActive }) => `console-topnav-link ${isActive ? 'active' : ''}`}>{item.label}</NavLink>
            : <a key={item.id} className="console-topnav-link" href={siteLinkHref(item.href)} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}>{item.label}</a>)}
        </nav>
        <div className="topbar-spacer" />
        <button className="icon-button topbar-theme" aria-label="Toggle color theme" onClick={toggle}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="account-menu-wrap" ref={accountRef}>
          <button className="account-trigger" onClick={() => setAccountOpen((value) => !value)} aria-haspopup="menu" aria-expanded={accountOpen}>
            <span className="avatar">{initials}</span><span className="account-name">{accountName}</span><ChevronDown size={15} />
          </button>
          {accountOpen && <div className="account-dropdown" role="menu">
            <div className="account-summary"><strong>{accountName}</strong><span>{user?.email}</span></div>
            <button role="menuitem" onClick={() => { setAccountOpen(false); navigate('/profile'); }}><Settings size={16} /> Account settings</button>
            <button role="menuitem" disabled={signingOut} onClick={signOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>
            {signOutError && <p className="account-menu-error" role="alert">{signOutError}</p>}
          </div>}
        </div>
      </header>
      <main className="content" key={location.pathname}><Outlet /></main>
    </section>
  </div>;
}

function readSidebarPreference() {
  try { return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'; } catch { return false; }
}

const portalRoutes = new Set(['/dashboard', '/api-keys', '/usage', '/status', '/subscriptions', '/redeem', '/profile']);
function isPortalRoute(href: string) { return portalRoutes.has(href); }
function siteLinkHref(href: string) { return href.startsWith('/') ? publicSiteHref(href) : href; }
