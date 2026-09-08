'use client';
import { trackDocsCopy } from '@kineticrouter/analytics-client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePublicSession } from './use-public-session';

function selectTab(root: HTMLElement, tab: HTMLElement, focus = false) {
  const tabList = tab.closest<HTMLElement>('[role="tablist"]');
  if (!tabList || !root.contains(tabList)) return;
  const tabs = [...tabList.querySelectorAll<HTMLElement>('[role="tab"]')];

  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', selected ? 'true' : 'false');
    item.tabIndex = selected ? 0 : -1;
    item.toggleAttribute('data-selected', selected);
    item.dataset.headlessuiState = selected ? 'selected' : '';
    const panelId = item.getAttribute('aria-controls');
    const panel = panelId ? root.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`) : null;
    if (panel) {
      panel.hidden = !selected;
      panel.style.display = selected ? '' : 'none';
      panel.toggleAttribute('data-selected', selected);
      panel.dataset.headlessuiState = selected ? 'selected' : '';
    }
  }

  if (focus) tab.focus();
}

export function DocsArticle({ html }: { html: string }) {
  const { playgroundEnabled } = usePublicSession();
  const rootRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const router = useRouter();

  useEffect(() => {
    const currentRoot = rootRef.current;
    if (!currentRoot) return;
    const root: HTMLDivElement = currentRoot;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let active = true;

    for (const tabList of root.querySelectorAll<HTMLElement>('[role="tablist"]')) {
      const selected = tabList.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?? tabList.querySelector<HTMLElement>('[role="tab"]');
      if (selected) selectTab(root, selected);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const link = target?.closest<HTMLAnchorElement>('a[href]');
      const href = link?.getAttribute('href');
      if (link && href && /^\/(?:docs|models|quickstart)(?:\/|#|$)/.test(href) && !link.target && !link.download && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.button === 0) {
        event.preventDefault();
        router.push(href);
        return;
      }
      const tab = target?.closest<HTMLElement>('[role="tab"]');
      if (tab && root.contains(tab)) {
        event.preventDefault();
        selectTab(root, tab, true);
        return;
      }

      const button = target?.closest<HTMLButtonElement>('button');
      if (!button || !root.contains(button)) return;
      if (button.title === 'Toggle word wrap') {
        event.preventDefault();
        button.closest('pre')?.classList.toggle('docs-code-wrapped');
        return;
      }
      if (button.title !== 'Copy code') return;
      event.preventDefault();
      const code = button.closest('pre')?.querySelector('code')?.textContent ?? '';
      if (!code) return;
      const write = navigator.clipboard?.writeText(code);
      if (!write) { setCopyStatus('Copy is unavailable. Select the code to copy it manually.'); return; }
      void write.then(() => {
        if (!active) return;
        trackDocsCopy();
        setCopyStatus('Code copied');
        const originalTitle = button.title;
        button.title = 'Copied';
        button.setAttribute('aria-label', 'Copied');
        const timer = setTimeout(() => {
          button.title = originalTitle;
          button.setAttribute('aria-label', 'Copy code');
          setCopyStatus('');
          timers.delete(timer);
        }, 1200);
        timers.add(timer);
      }).catch(() => { if (active) setCopyStatus('Could not copy. Select the code to copy it manually.'); });
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.matches('[role="tab"]') || !root.contains(target)) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabList = target.closest<HTMLElement>('[role="tablist"]');
      if (!tabList) return;
      const tabs = [...tabList.querySelectorAll<HTMLElement>('[role="tab"]')];
      const current = tabs.indexOf(target);
      if (current < 0) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (current + 1) % tabs.length
            : (current - 1 + tabs.length) % tabs.length;
      const next = tabs[nextIndex];
      if (next) selectTab(root, next, true);
    }

    root.addEventListener('click', handleClick);
    root.addEventListener('keydown', handleKeyDown);
    return () => {
      active = false;
      timers.forEach(clearTimeout);
      root.removeEventListener('click', handleClick);
      root.removeEventListener('keydown', handleKeyDown);
    };
  }, [html, router]);

  return <><div ref={rootRef} className="clear-both docs-article" data-playground-enabled={playgroundEnabled} dangerouslySetInnerHTML={{ __html: html }} /><p className="docs-copy-status" role="status">{copyStatus}</p></>;
}
