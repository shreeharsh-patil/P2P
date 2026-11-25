import React, { useEffect, useId, useRef, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { TransferItem } from '../engine/types';
import { formatBytes } from '../utils/formatters';
import { Button } from './ui/button';

const TEXT_LIMIT = 128 * 1024;
const TEXT_EXTENSIONS = /\.(txt|md|csv|tsv|log|json|xml|ya?ml|html?|css|[jt]sx?|py|sh|sql|ini|toml)$/i;

function getPreviewKind(item: TransferItem) {
  const type = item.type.toLowerCase().split(';')[0].trim();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || /\.pdf$/i.test(item.name)) return 'pdf';
  if (type.startsWith('text/') || TEXT_EXTENSIONS.test(item.name)) return 'text';
  if (!type || type === 'application/octet-stream') {
    if (/\.(avif|bmp|gif|ico|jpe?g|png|webp)$/i.test(item.name)) return 'image';
    if (/\.(mp4|m4v|mov|webm)$/i.test(item.name)) return 'video';
    if (/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(item.name)) return 'audio';
  }
  return 'unsupported';
}

interface FilePreviewModalProps {
  item: TransferItem & { downloadUrl: string };
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ item, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const kind = getPreviewKind(item);
  const blob = item.downloadBlob;
  const [text, setText] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (kind !== 'text' && kind !== 'pdf') return;

    let disposed = false;
    let objectUrl: string | undefined;
    const loadPreview = async () => {
      if (!blob) throw new Error('Preview data is unavailable.');
      if (kind === 'text') {
        const content = await blob.slice(0, TEXT_LIMIT).text();
        if (!disposed) setText(content);
      } else {
        const header = await blob.slice(0, 5).text();
        if (header !== '%PDF-') throw new Error('The file does not have a valid PDF header.');
        if (!disposed) {
          objectUrl = URL.createObjectURL(blob.slice(0, blob.size, 'application/pdf'));
          setPdfUrl(objectUrl);
        }
      }
    };

    void loadPreview().catch(() => {
      if (!disposed) setError('This file could not be previewed.');
    });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob, kind]);

  const handleMediaError = () => setError('Your browser could not display this file.');
  let content: React.ReactNode;

  if (error || kind === 'unsupported') {
    content = (
      <div className="grid min-h-44 place-content-center gap-3 p-6 text-center">
        <FileText aria-hidden="true" className="mx-auto size-9 text-[#ff666b]" />
        <p className="text-sm text-[#b2b2b8]" role={error ? 'status' : undefined}>
          {error || 'Preview is unavailable for this file type.'}
        </p>
        <p className="text-xs text-[#929297]">Download the file to open it on your device.</p>
      </div>
    );
  } else if (kind === 'image') {
    content = <img src={item.downloadUrl} alt={item.name} onError={handleMediaError} className="mx-auto max-h-[62dvh] w-full object-contain p-3 sm:p-5" />;
  } else if (kind === 'video') {
    content = <video src={item.downloadUrl} onError={handleMediaError} controls playsInline preload="metadata" className="mx-auto max-h-[62dvh] w-full" />;
  } else if (kind === 'audio') {
    content = (
      <div className="grid min-h-36 place-items-center px-3 sm:px-5">
        <audio src={item.downloadUrl} aria-label={item.name} onError={handleMediaError} controls preload="metadata" className="w-full max-w-md" />
      </div>
    );
  } else if (kind === 'text' && text !== null) {
    content = (
      <div className="flex min-h-36 flex-col">
        <pre className="max-h-[55dvh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-[#e5e5e7] sm:p-5 sm:text-sm">{text || 'This file is empty.'}</pre>
        {blob && blob.size > TEXT_LIMIT && (
          <p className="border-t border-white/10 px-4 py-3 text-xs text-[#a0a0a0]">Showing the first 128 KB. Download the file to read the rest.</p>
        )}
      </div>
    );
  } else if (kind === 'pdf' && pdfUrl) {
    content = <iframe src={pdfUrl} title={`PDF preview of ${item.name}`} className="block h-[57dvh] min-h-36 w-full" />;
  } else {
    content = <p role="status" className="grid min-h-36 place-items-center p-6 text-sm text-[#a0a0a0]">Loading preview…</p>;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl rounded-xl border border-[#29292f] bg-[#0b0b0d] text-[#f2f2f2] shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="hidden shrink-0 rounded-lg border border-[#ff2b2b]/25 bg-[#ff2b2b]/10 p-2.5 text-[#ff777c] sm:block">
            <FileText aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} title={item.name} className="truncate text-base font-semibold sm:text-lg">{item.name}</h2>
            <p className="mt-1 break-words text-xs text-[#a0a0a0]">
              {formatBytes(item.size)} <span aria-hidden="true">·</span> {item.type || 'Unknown format'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview" className="shrink-0">
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#060607]">{content}</div>

        <div className="flex justify-end">
          <a href={item.downloadUrl} download={item.name} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#c91b25] px-4 text-sm font-medium text-white transition-colors hover:bg-[#e02630] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff777c]">
            <Download aria-hidden="true" className="size-4" /> Download
          </a>
        </div>
      </div>
    </dialog>
  );
};
