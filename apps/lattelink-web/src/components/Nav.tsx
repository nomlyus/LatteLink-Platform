"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NomlyMark } from "./Logo";
import { merchantStartHref } from "@/lib/site";
import { TrackedAnchor } from "./TrackedAnchor";
import { buttonStyles } from "./Sections";

const links = [
  { href: "#product", label: "Product" },
  { href: "#solutions", label: "Solutions" },
  { href: "#nomly", label: "Company" },
  { href: "#contact", label: "Contact" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "saturate(140%) blur(12px)",
          WebkitBackdropFilter: "saturate(140%) blur(12px)",
          borderBottom: `1px solid ${
            scrolled ? "var(--color-border)" : "transparent"
          }`,
          transition: "border-color 0.25s ease",
        }}
      >
        <div
          className="page-shell"
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            aria-label="nomly home"
          >
            <NomlyMark size={18} />
          </Link>

          <ul className="nav-links">
            {links.map((l) => (
              <li key={l.href}>
                <TrackedAnchor
                  href={l.href}
                  className="nav-link"
                  eventName="section_navigation_click"
                  eventProperties={{ placement: "nav", destination: l.href }}
                >
                  {l.label}
                </TrackedAnchor>
              </li>
            ))}
          </ul>

          <TrackedAnchor
            href={merchantStartHref}
            style={buttonStyles("primary")}
            eventName="cta_click"
            eventProperties={{
              placement: "nav",
              label: "start_building",
              destination: "client_dashboard",
            }}
          >
            Start building
          </TrackedAnchor>
        </div>
      </nav>

      <style jsx>{`
        .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
          list-style: none;
        }
        .nav-link {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-muted);
          transition: color 0.18s ease;
        }
        .nav-link:hover {
          color: var(--color-text);
        }
        @media (max-width: 820px) {
          .nav-links {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
