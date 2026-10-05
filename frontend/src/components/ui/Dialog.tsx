'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { focusableWithin, trapTarget } from '@/lib/a11y/focus';

interface DialogProps {
  /** id of the element that names the dialog (usually its heading). */
  labelledBy: string;
  /** Escape, backdrop click and the caller's own close controls call this. */
  onClose: () => void;
  /** Overrides what Escape does (the video player leaves fullscreen first). */
  onEscape?: () => void;
  /** False ignores clicks on the backdrop (default true). */
  closeOnBackdrop?: boolean;
  /** Classes for the full-screen backdrop. */
  overlayClassName?: string;
  /** Classes for the dialog box itself. */
  className?: string;
  /** Receives the dialog box element (the video player makes it fullscreen). */
  panelRef?: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

// Only the most recently opened dialog reacts to Escape and Tab, and the body stays locked
// until the last one closes.
const openDialogs: symbol[] = [];
let savedBodyOverflow = '';

const DEFAULT_OVERLAY = 'fixed inset-0 z-50 overflow-y-auto bg-gray-600/50 p-4';
const DEFAULT_PANEL =
  'relative mx-auto mt-16 w-full max-w-sm rounded-md border bg-white p-5 shadow-lg';

/**
 * A modal dialog: `role="dialog"` with `aria-modal` and `aria-labelledby`, focus moved inside on
 * open and kept there with Tab, Escape and backdrop click to close, focus restored to the
 * element that opened it, and the page behind locked from scrolling. Render it only while open.
 */
export default function Dialog({
  labelledBy,
  onClose,
  onEscape,
  closeOnBackdrop = true,
  overlayClassName = DEFAULT_OVERLAY,
  className = DEFAULT_PANEL,
  panelRef,
  children,
}: DialogProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = panelRef ?? ownRef;
  // The latest callbacks, so the open/close effect runs once per mount.
  const handlers = useRef({ onClose, onEscape });
  handlers.current = { onClose, onEscape };

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const id = Symbol('dialog');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (openDialogs.length === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(id);
    (focusableWithin(panel)[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        (handlers.current.onEscape ?? handlers.current.onClose)();
      } else if (e.key === 'Tab') {
        const target = trapTarget(panel, document.activeElement, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = openDialogs.indexOf(id);
      if (index !== -1) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = savedBodyOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [ref]);

  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) handlers.current.onClose();
  };

  return (
    // The backdrop is only a mouse shortcut; keyboard users close with Escape or a button.
    <div className={overlayClassName} role="presentation" onClick={handleBackdrop}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${className} focus:outline-hidden`}
      >
        {children}
      </div>
    </div>
  );
}
