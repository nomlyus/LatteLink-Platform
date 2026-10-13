"use client";

import React, { useEffect, useRef } from "react";
import Image from "next/image";

type DashboardSearchProps = {
  label: string;
  controls: string;
  query: string;
  onQueryChange: (query: string) => void;
};

export function DashboardSearch({ label, controls, query, onQueryChange }: DashboardSearchProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  return <label className="dash-global-search dash-global-search--interactive">
    <Image className="dash-global-search__icon" src="/icons/operator-v3/search.svg" width={18} height={18} unoptimized alt="" />
    <input ref={input} className="dash-global-search__input" type="search" value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onQueryChange(""); } }}
      autoComplete="off" aria-label={label} aria-controls={controls} />
    {!query ? <span className="dash-global-search__shortcut" aria-hidden="true">⌘ + K</span> : null}
  </label>;
}
