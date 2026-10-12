"use client";
import { useEffect, useId, useRef, useState } from "react";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
export type MenuAction = {
  label: string;
  action: () => void;
  danger?: boolean;
};
export default function Menu({
  label,
  actions,
}: {
  label: string;
  actions: MenuAction[];
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  function close() {
    setOpen(false);
    button.current?.focus();
  }
  return (
    <div className="more-menu" ref={root}>
      <button
        ref={button}
        className="icon-button"
        aria-label={"更多操作：" + label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <DotsHorizontalIcon />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className="menu-content"
          onKeyDown={(e) => {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[role=menuitem]",
              ),
            );
            const i = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              buttons[
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                      buttons.length
              ]?.focus();
            }
            if (e.key === "Tab") close();
          }}
        >
          {actions.map((a) => (
            <button
              role="menuitem"
              key={a.label}
              className={a.danger ? "danger-text" : ""}
              onClick={() => {
                close();
                a.action();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
