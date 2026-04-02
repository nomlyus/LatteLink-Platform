"use client";

import Link from "next/link";
import { AnimateIn, Stagger, StaggerItem } from "./AnimateIn";
import { SectionEye, SectionH } from "./Features";
import { contactEmail, demoHref } from "@/lib/site";
import { LeadCapture } from "./LeadCapture";

const stats = [
  { value: "Pilot", suffix: "", label: "Current stage" },
  { value: "Coffee", suffix: "-only", label: "Product focus" },
  { value: "0", suffix: "%", label: "LatteLink order markup" },
  { value: "Founder", suffix: "-led", label: "Build approach" },
];

const fitPoints = [
  "Independent coffee shops that want repeat ordering under their own brand",
  "Operators who care about loyalty, retention, and direct customer ownership",
  "Teams that want setup handled for them rather than piecing together tools",
  "Single-location shops today, with room for multi-location growth later",
];

const nextSteps = [
  {
    step: "01",
    title: "Talk through fit",
    desc: "We learn how your shop operates and whether LatteLink is the right match.",
  },
  {
    step: "02",
    title: "Review brand and menu",
    desc: "We map the customer flow, loyalty setup, and operator needs around your real menu.",
  },
  {
    step: "03",
    title: "Get a pilot plan",
    desc: "You leave with a concrete next-step recommendation instead of a vague sales promise.",
  },
];

export function About() {
  return (
    <section id="about" style={{ padding: "140px 0", position: "relative", zIndex: 1 }}>
      <style>{`
        .about-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 90px;
          align-items: center;
        }
        .a-stat {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 16px; padding: 20px;
          transition: border-color 0.25s, transform 0.25s;
        }
        .a-stat:hover { border-color: rgba(74,126,255,0.2); transform: translateY(-2px); }
        .about-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .fit-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 40px;
          position: relative;
          overflow: hidden;
        }
        .fit-list {
          display: grid;
          gap: 14px;
        }
        .fit-item {
          display: grid;
          grid-template-columns: 22px 1fr;
          gap: 12px;
          align-items: start;
          font-size: 14px;
          line-height: 1.75;
          color: var(--color-gray-300);
        }
        .fit-check {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(74,126,255,0.12);
          border: 1px solid rgba(74,126,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-blue-400);
          font-size: 12px;
          margin-top: 1px;
        }
        @media (max-width: 960px) {
          .about-layout {
            grid-template-columns: 1fr;
            gap: 40px;
          }
        }
        @media (max-width: 640px) {
          .about-stats {
            grid-template-columns: 1fr;
          }
          .fit-card {
            padding: 28px 24px;
          }
        }
      `}</style>

      <div className="page-shell">
        <div className="about-layout">
          {/* Left */}
          <AnimateIn direction="left">
            <div>
              <SectionEye>Why LatteLink</SectionEye>
              <SectionH>
                Built from the day-to-day reality of a coffee shop.
              </SectionH>
              <p
                style={{
                  fontSize: 16,
                  color: "var(--color-gray-400)",
                  lineHeight: 1.8,
                  margin: "20px 0 36px",
                }}
              >
                LatteLink exists because independent cafés keep getting pushed
                toward the same bad options: generic marketplace tools, bloated
                restaurant software, or expensive custom builds.
                <br />
                <br />
                The goal is narrower and more practical than that. Build one
                strong product for coffee shops, handle the setup with them, and
                give operators a direct relationship with their regulars.
              </p>

              <Stagger className="about-stats">
                {stats.map((s) => (
                  <StaggerItem key={s.label}>
                    <div className="a-stat">
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 30,
                          fontWeight: 800,
                          letterSpacing: "-0.03em",
                          color: "var(--color-gray-100)",
                        }}
                      >
                        {s.value}
                        <span style={{ color: "var(--color-blue-500)" }}>
                          {s.suffix}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-gray-500)",
                          marginTop: 4,
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </AnimateIn>

          {/* Right */}
          <AnimateIn direction="right">
            <div className="fit-card">
              <div
                style={{
                  position: "absolute",
                  top: -80,
                  right: -80,
                  width: 280,
                  height: 280,
                  background:
                    "radial-gradient(circle, rgba(74,126,255,0.1) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--color-gray-100)",
                  lineHeight: 1.25,
                  letterSpacing: "-0.022em",
                  marginBottom: 14,
                  position: "relative",
                }}
              >
                Best fit right now
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: "var(--color-gray-400)",
                  lineHeight: 1.75,
                  marginBottom: 28,
                }}
              >
                LatteLink is strongest for independent coffee businesses that
                want a branded repeat-ordering channel, not for every food
                business under the sun.
              </div>
              <div className="fit-list">
                {fitPoints.map((point) => (
                  <div key={point} className="fit-item">
                    <div className="fit-check">✓</div>
                    <div>{point}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 32 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #1535e8, #4a7eff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "white",
                  }}
                >
                  Y
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--color-gray-200)",
                    }}
                  >
                    Yazan
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-gray-500)", marginTop: 2 }}>
                    Founder, LatteLink
                  </div>
                </div>
              </div>
            </div>
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section id="contact" style={{ padding: "140px 0", position: "relative", zIndex: 1 }}>
      <div className="page-shell">
        <AnimateIn direction="scale">
          <div
            className="cta-card"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid rgba(74,126,255,0.2)",
              borderRadius: 32,
              padding: "100px 60px",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -120,
                left: "50%",
                transform: "translateX(-50%)",
                width: 700,
                height: 500,
                background:
                  "radial-gradient(ellipse, rgba(74,126,255,0.12) 0%, transparent 65%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ display: "flex", justifyContent: "center" }}>
              <SectionEye>Get started</SectionEye>
            </div>

            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(28px, 4vw, 48px)",
                letterSpacing: "-0.038em",
                lineHeight: 1.08,
                color: "var(--color-gray-100)",
                maxWidth: 580,
                margin: "0 auto 16px",
              }}
            >
              Ready to bring your café online?
            </h2>

            <p
              style={{
                fontSize: 16,
                color: "var(--color-gray-400)",
                lineHeight: 1.75,
                maxWidth: 560,
                margin: "0 auto 44px",
              }}
            >
              Request an intro and we will reply with the fastest path to a
              pilot. We look at fit first, then confirm the walkthrough.
            </p>

            <div className="cta-grid">
              <div className="cta-copy-column">
                <div className="cta-subnote">
                  Best for independent coffee shops that want a branded
                  repeat-ordering channel and direct customer ownership.
                </div>
                <div className="cta-steps">
                  {nextSteps.map((item) => (
                    <div key={item.step} className="cta-step-card">
                      <div className="cta-step-num">{item.step}</div>
                      <div className="cta-step-title">{item.title}</div>
                      <div className="cta-step-copy">{item.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="cta-contact-line">
                  Prefer a direct thread?{" "}
                  <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
                </div>
              </div>
              <LeadCapture />
            </div>
          </div>
        </AnimateIn>
      </div>

      <style>{`
        .cta-card {
          text-align: center;
        }
        .cta-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 24px;
          align-items: start;
        }
        .cta-copy-column {
          text-align: left;
        }
        .cta-subnote {
          margin: 8px 0 24px;
          max-width: 520px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-gray-400);
        }
        .cta-steps {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          margin-top: 0;
          text-align: left;
        }
        .cta-step-card {
          background: rgba(9,9,15,0.4);
          border: 1px solid var(--color-border);
          border-radius: 18px;
          padding: 22px;
        }
        .cta-step-num {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-blue-500);
          margin-bottom: 10px;
        }
        .cta-step-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--color-gray-100);
          margin-bottom: 8px;
        }
        .cta-step-copy {
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-gray-400);
        }
        .cta-contact-line {
          margin-top: 18px;
          font-size: 13px;
          color: var(--color-gray-500);
        }
        .cta-contact-line a {
          color: var(--color-gray-200);
          text-decoration: none;
        }
        .cta-contact-line a:hover {
          color: white;
        }
        @media (max-width: 960px) {
          .cta-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .cta-card {
            padding: 76px 24px !important;
          }
        }
      `}</style>
    </section>
  );
}

export function Footer() {
  return (
    <footer
      className="site-footer"
      style={{
        borderTop: "1px solid var(--color-border-s)",
        padding: "48px 0",
        position: "relative",
        zIndex: 1,
      }}
    >
      <style>{`
        .footer-shell {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 24px;
        }
        .footer-links {
          display: flex;
          gap: 28px;
          list-style: none;
        }
        @media (max-width: 720px) {
          .site-footer {
            padding: 36px 0 !important;
          }
          .footer-shell {
            justify-content: center;
            text-align: center;
          }
          .footer-links {
            flex-wrap: wrap;
            justify-content: center;
          }
        }
      `}</style>
      <div className="page-shell footer-shell">
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(145deg, #1535e8, #2a5fff, #6aa0ff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(74,126,255,0.25)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 54 54" fill="none">
              <path d="M14 8 L14 36 Q14 45 23 45 L45 45" stroke="white" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              <path d="M23 23 A13 13 0 0 1 36 36" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
              <circle cx="14" cy="8" r="5.5" fill="white" />
              <circle cx="45" cy="45" r="5.5" fill="white" />
            </svg>
          </div>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--color-gray-500)",
            }}
          >
            Latte<span style={{ color: "var(--color-blue-500)" }}>Link</span>
          </span>
        </Link>

        <ul className="footer-links">
          {[
            { href: "#features", label: "Features" },
            { href: "#pricing", label: "Pricing" },
            { href: "#about", label: "About" },
            { href: demoHref, label: "Contact" },
          ].map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                style={{
                  fontSize: 13,
                  color: "var(--color-gray-600)",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div style={{ fontSize: 12, color: "var(--color-gray-700)" }}>
          © 2026 LatteLink. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
