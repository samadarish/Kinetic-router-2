import assets from './documentation-images.json';

type DocumentationImage = { src: string; alt: string; width: number; height: number; revision: string };
const images: Record<string, DocumentationImage> = assets;
const decodeAttribute = (value: string) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
const escapeAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function localizeDocumentationImages(html: string) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const source = tag.match(/\ssrc="([^"]*)"/i)?.[1];
    const image = source ? images[decodeAttribute(source)] : undefined;
    if (!image) return tag;
    const versionedSource = `${image.src}?v=${image.revision}`;
    // Keep authored thumbnail widths (notably the side-by-side phone captures)
    // while reserving the final asset's actual aspect ratio with width/height.
    const authoredWidth = Number(tag.match(/\swidth="(\d+)"/i)?.[1]);
    const displayWidth = authoredWidth > 0 ? Math.min(authoredWidth, image.width) : image.width;
    // Rebuild the image tag so the old optimizer srcset and inline blur preview
    // cannot override the local source. Numeric dimensions reserve layout space.
    return `<a class="docs-screenshot-link" style="width:${displayWidth}px;max-width:100%" href="${escapeAttribute(versionedSource)}" target="_blank" rel="noopener noreferrer" aria-label="Open full-size image: ${escapeAttribute(image.alt)}"><img src="${escapeAttribute(versionedSource)}" alt="${escapeAttribute(image.alt)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async"></a>`;
  });
}
