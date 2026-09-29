"use client";

import React from "react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function DashboardDialog({
  title,
  subtitle,
  children,
  onClose,
  panelClassName = "dash-menu-modal__panel--wide",
  nested = false
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
  nested?: boolean;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeHandler = useRef(onClose);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  closeHandler.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>(focusableSelector);
    (firstField ?? panel)?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      const topmostDialog = [...document.querySelectorAll<HTMLElement>(".dash-menu-modal")].at(-1);
      if (rootRef.current !== topmostDialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      opener?.focus({ preventScroll: true });
    };
  }, []);

  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = setTimeout(() => closeHandler.current(), 300);
  }

  return (
    <div ref={rootRef} className={`dash-modal dash-menu-modal dash-menu-modal--opening${closing ? " dash-menu-modal--closing" : ""}${nested ? " dash-menu-modal--nested" : ""}`}>
      <button className="dash-modal__backdrop" type="button" onClick={requestClose} aria-label={`Close ${title}`} />
      <section
        ref={panelRef}
        className={`dash-menu-modal__panel ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="dash-menu-modal__header">
          <div><h3 id={titleId}>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button className="dash-menu-modal__close" type="button" onClick={requestClose} aria-label={`Close ${title}`}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}
