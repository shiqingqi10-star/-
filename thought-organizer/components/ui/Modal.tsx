"use client";
import { useEffect, useRef, useId, ReactNode } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
export default function Modal({
  title,
  children,
  onClose,
  drawer = false,
  description,
  returnFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  description?: string;
  returnFocus?: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef(onClose),
    returnTarget = useRef(returnFocus),
    id = useId();
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current!;
    const opener =
      returnTarget.current || (document.activeElement as HTMLElement | null);
    element.showModal();
    const initial = element.querySelector<HTMLElement>(
      '.modal-body input:not([type="checkbox"]), .modal-body textarea, .modal-body select',
    );
    initial?.focus();
    const saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = saved;
      if (opener?.isConnected) opener.focus();
      else document.querySelector<HTMLElement>("main h1")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={drawer ? "modal drawer" : "modal"}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div className="modal-surface">
        <header className="modal-head">
          <div>
            <h2 id={id}>{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label={"关闭" + title}
            onClick={onClose}
          >
            <Cross2Icon />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
