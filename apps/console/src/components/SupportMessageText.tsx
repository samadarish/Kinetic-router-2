import { type ReactNode } from 'react';
import { LinkifyIt } from 'linkify-it';
import tlds from 'tlds';

const linkify = new LinkifyIt({ fuzzyLink: true, fuzzyIP: false, tlds });

/** Linkify web addresses without interpreting message text as HTML or Markdown. */
export function SupportMessageText({ body }: { body: string }) {
  const content: ReactNode[] = [];
  let offset = 0;
  for (const match of linkify.match(body) ?? []) {
    content.push(body.slice(offset, match.index));
    const href = !match.schema || match.schema === '//'
      ? `https://${match.raw.replace(/^\/\//, '')}` : match.url;
    let webLink = false;
    try {
      const url = new URL(href);
      webLink = (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    } catch { /* Invalid addresses remain ordinary message text. */ }
    content.push(webLink
      ? <a key={match.index} href={href} target="_blank" rel="noopener noreferrer">{match.raw}</a>
      : match.raw);
    offset = match.lastIndex;
  }
  content.push(body.slice(offset));
  return <span className="support-message-text">{content}</span>;
}
