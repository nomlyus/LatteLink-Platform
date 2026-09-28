"use client";

import { useEffect, useRef } from "react";
import type { DashboardSection } from "../model";

export function ClientDashboardRoot({ initialSection }: { initialSection?: DashboardSection }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialSectionRef = useRef(initialSection);
  const lastSectionRef = useRef(initialSection);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const mountSection = initialSectionRef.current;

    void (async () => {
      if (mountSection) {
        const storage = await import("../storage");
        if (cancelled) return;
        storage.persistSection(mountSection);
      }
      const runtime = await import("../main");
      if (cancelled || !rootRef.current) return;
      const effectiveSection = lastSectionRef.current ?? mountSection;
      if (effectiveSection && effectiveSection !== mountSection) {
        const storage = await import("../storage");
        if (cancelled) return;
        storage.persistSection(effectiveSection);
      }
      dispose = runtime.mountLegacyDashboard(rootRef.current, effectiveSection);
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (lastSectionRef.current === initialSection) return;
    lastSectionRef.current = initialSection;
    if (!initialSection) return;

    let cancelled = false;
    void import("../main").then((runtime) => {
      if (!cancelled) runtime.setLegacyDashboardSection(initialSection);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSection]);

  return <div id="app" ref={rootRef} />;
}
