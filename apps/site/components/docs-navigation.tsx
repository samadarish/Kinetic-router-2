'use client';

import { SiteLink } from './site-link';
import { useEffect, useRef } from 'react';
import type { DocsNavigationGroup } from '@/data/docs-navigation';

export function DocsNavigation({ groups, route, className = '', onNavigate }: { groups: DocsNavigationGroup[]; route: string; className?: string; onNavigate?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !active) return;
    const containerBox = container.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (activeBox.top >= containerBox.top && activeBox.bottom <= containerBox.bottom) return;
    container.scrollTo({
      top: container.scrollTop + activeBox.top - containerBox.top - (container.clientHeight - activeBox.height) / 2,
      behavior: 'auto',
    });
  }, [route]);

  return (
    <div ref={containerRef} className={`docs-navigation ${className}`}>
      {groups.map((group) => <section key={group.label} className="docs-navigation-group">
        <h2>{group.label}</h2>
        <nav aria-label={`${group.label} documentation`}>
          {group.links.map((link) => {
            const active = route === link.href;
            return <SiteLink
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              data-depth={link.depth ?? 0}
              onClick={onNavigate}
              className={active ? 'docs-navigation-link active' : 'docs-navigation-link'}
            >
              {link.iconSvg && <span className="docs-navigation-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: link.iconSvg }} />}
              <span>{link.label}</span>
            </SiteLink>;
          })}
        </nav>
      </section>)}
    </div>
  );
}
