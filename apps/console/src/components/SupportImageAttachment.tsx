import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, LoaderCircle, Maximize2, X } from 'lucide-react';
import { prepareSupportImage, type PreparedSupportImage } from '../lib/support-images';
import { readSupportImageDraft, supportImageDraftEpoch, supportImageDraftKey, SupportImageDraftNeedsReattachmentError, writeSupportImageDraft } from '../lib/support-image-drafts';
import { Button } from './Ui';
import './support-images.css';

export function useSupportImageDraft(draftKey: string, userId: string, onChange: () => void) {
  const [key] = useState(() => supportImageDraftKey(userId, draftKey));
  const [image, setImage] = useState<PreparedSupportImage | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [storageWarning, setStorageWarning] = useState('');
  const imageRef = useRef(image), busyRef = useRef(true), version = useRef(0), changeRef = useRef(onChange);
  changeRef.current = onChange;
  useEffect(() => {
    let active = true;
    const epoch = supportImageDraftEpoch(userId), current = version.current;
    void readSupportImageDraft(key, userId).then(value => {
      if (!active || current !== version.current || epoch !== supportImageDraftEpoch(userId)) return;
      imageRef.current = value; setImage(value); busyRef.current = false; setBusy(false);
    }).catch(cause => {
      if (!active || current !== version.current || epoch !== supportImageDraftEpoch(userId)) return;
      if (cause instanceof SupportImageDraftNeedsReattachmentError) setError(cause.message);
      busyRef.current = false; setBusy(false);
    });
    return () => { active = false; version.current++; };
  }, [key, userId]);

  async function select(files: File[]) {
    if (busyRef.current) return;
    if (!files.length) return;
    setError('');
    if (files.length !== 1 || imageRef.current) { setError('Attach one image per message. Remove the current image before choosing another.'); return; }
    busyRef.current = true; setBusy(true);
    const current = ++version.current, epoch = supportImageDraftEpoch(userId);
    try {
      const prepared = await prepareSupportImage(files[0]!);
      if (current !== version.current || epoch !== supportImageDraftEpoch(userId)) return;
      imageRef.current = prepared; setImage(prepared); changeRef.current();
      const persisted = await writeSupportImageDraft(userId, key, prepared);
      if (current === version.current) setStorageWarning(persisted ? '' : 'This image is saved for this visit only. Keep this tab open until you send it.');
    } catch (cause) { if (current === version.current) setError(cause instanceof Error ? cause.message : 'This image could not be prepared. Please try again.'); }
    finally { if (current === version.current) { busyRef.current = false; setBusy(false); } }
  }
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file !== null);
    if (!files.length) return;
    event.preventDefault();
    void select(files);
  }
  async function clear() {
    version.current++; imageRef.current = null; busyRef.current = false;
    setImage(null); setBusy(false); setError(''); setStorageWarning('');
    await writeSupportImageDraft(userId, key, null);
  }
  function remove() { void clear(); changeRef.current(); }
  return { image, busy, error, storageWarning, select, onPaste, remove, clear };
}

type ImageDraftControl = ReturnType<typeof useSupportImageDraft>;
function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

export function SupportImagePicker({ attachment, disabled = false }: { attachment: ImageDraftControl; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null), url = useObjectUrl(attachment.image?.blob);
  return <div className="support-image-picker">
    <input ref={input} className="support-image-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose an image" tabIndex={-1} disabled={disabled || attachment.busy || Boolean(attachment.image)} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void attachment.select(files); }} />
    {attachment.image ? <div className="support-image-draft">
      {url && <img src={url} alt="Image attachment preview" width={attachment.image.width} height={attachment.image.height} />}
      <div><strong>Image attached</strong><span>{attachment.image.blob.size >= 1024 * 1024 ? `${(attachment.image.blob.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(attachment.image.blob.size / 1024))} KB`}</span></div>
      <button type="button" className="icon-button" onClick={attachment.remove} disabled={disabled || attachment.busy} aria-label="Remove image"><X size={16} /></button>
    </div> : <Button type="button" variant="ghost" className="support-attach-button" disabled={disabled || attachment.busy} onClick={() => input.current?.click()}><ImagePlus size={17} />Attach image<span className="support-paste-hint">or paste</span></Button>}
    {attachment.busy && <span className="support-image-preparing" role="status"><LoaderCircle size={14} className="spin" />Preparing image…</span>}
    {attachment.error && <p className="support-image-error" role="alert">{attachment.error}</p>}
    {attachment.storageWarning && <p className="support-image-storage-hint" role="status">{attachment.storageWarning}</p>}
  </div>;
}

type MessageImage = { url: string; width: number; height: number; byteSize: number; mimeType: string };
function EnlargedImage({ image, close }: { image: MessageImage; close(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return createPortal(<dialog ref={dialog} className="support-image-dialog" aria-label="Image attachment" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="support-image-viewer"><div className="support-image-viewer-bar"><span>Image attachment</span><a href={image.url} target="_blank" rel="noreferrer">Open full size</a><button type="button" className="icon-button" onClick={close} aria-label="Close image"><X size={20} /></button></div><img src={image.url} alt="Customer image attachment, enlarged" width={image.width} height={image.height} /></div>
  </dialog>, document.body);
}

export function SupportMessageImage({ image }: { image: MessageImage }) {
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  if (failed) return <div className="support-image-unavailable"><span>Image could not be loaded.</span><button type="button" onClick={() => { setRetry(value => value + 1); setFailed(false); }}>Try again</button></div>;
  return <>
    <button type="button" className="support-message-image" aria-label="Enlarge image attachment" onClick={() => setOpen(true)} style={{ aspectRatio: `${image.width} / ${image.height}`, width: Math.min(image.width, 360) }}>
      <img key={retry} src={image.url} alt="Customer image attachment" width={image.width} height={image.height} loading="lazy" decoding="async" onError={() => setFailed(true)} /><span aria-hidden="true"><Maximize2 size={15} /></span>
    </button>
    {open && <EnlargedImage image={image} close={() => setOpen(false)} />}
  </>;
}
