"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimateIn } from "./AnimateIn";
import { SectionEye, SectionH, SectionP } from "./Features";

const steps = [
  {
    num: "01",
    icon: "☎️",
    title: "Request a pilot intro",
    desc: "Tell us about your shop, your menu, and how customers order today. We quickly confirm whether LatteLink is the right fit before scheduling the walkthrough.",
    visual: "We start with fit, not a hard sell.",
  },
  {
    num: "02",
    icon: "🎨",
    title: "We configure your launch",
    desc: "We set up your brand, menu, loyalty rules, and client dashboard flow. You review and approve, and we handle the technical heavy lifting.",
    visual: "Your brand, your menu, your rules. We handle setup.",
  },
  {
    num: "03",
    icon: "🚀",
    title: "Launch under your brand",
    desc: "Your app is prepared for release under your name. We guide the submission and launch process instead of handing you a pile of vendor tasks.",
    visual: "Your app, your listing, your customer relationship.",
  },
  {
    num: "04",
    icon: "📈",
    title: "Operate and iterate",
    desc: "Once the app is live, orders, loyalty activity, and customer data flow into the client dashboard so you can keep improving the experience.",
    visual: "Launch fast, then improve with real customer behavior.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);

  // Auto-cycle
  useEffect(() => {
    const t = setInterval(() => {
      setActive((i) => (i + 1) % steps.length);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const step = steps[active]!;

  return (
    <section id="how" style={{ padding: "140px 0", position: "relative", zIndex: 1 }}>
      <style>{`
        .how-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 100px;
          align-items: center;
          margin-top: 80px;
        }
        .how-step-row {
          display: flex;
          gap: 22px;
          padding: 28px 0;
          border-bottom: 1px solid var(--color-border-s);
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .how-step-row:last-child { border-bottom: none; }
        .how-step-num {
          width: 34px; height: 34px;
          border-radius: 50%;
          border: 1px solid var(--color-border);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-size: 12px; font-weight: 700;
          color: var(--color-gray-600);
          flex-shrink: 0; margin-top: 2px;
          transition: all 0.3s;
        }
        .how-step-row.active .how-step-num {
          border-color: var(--color-blue-600);
          color: var(--color-blue-400);
          background: rgba(74,126,255,0.1);
          box-shadow: 0 0 16px rgba(74,126,255,0.2);
        }
        .how-step-title {
          font-family: var(--font-display);
          font-size: 16px; font-weight: 700;
          color: var(--color-gray-500); margin-bottom: 6px;
          transition: color 0.3s;
        }
        .how-step-row.active .how-step-title { color: var(--color-gray-100); }
        .how-step-desc {
          font-size: 14px; color: var(--color-gray-500); line-height: 1.7;
          max-height: 0; overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s;
          opacity: 0;
        }
        .how-step-row.active .how-step-desc { max-height: 100px; opacity: 1; }
        @media (max-width: 920px) {
          .how-layout {
            grid-template-columns: 1fr;
            gap: 36px;
          }
        }
        @media (max-width: 720px) {
          .how-step-row {
            gap: 16px;
            padding: 22px 0;
          }
        }
      `}</style>

      <div className="page-shell">
        <AnimateIn>
          <SectionEye>Process</SectionEye>
        </AnimateIn>
        <AnimateIn delay={0.05}>
          <SectionH>From intro request to pilot launch, fast.</SectionH>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <SectionP>
            The process is intentionally hands-on. You do not need to manage a
            stack of contractors, software vendors, or app-store paperwork.
          </SectionP>
        </AnimateIn>

        <div className="how-layout">
          {/* Steps */}
          <AnimateIn direction="left">
            <div>
              {steps.map((s, i) => (
                <div
                  key={s.num}
                  className={`how-step-row${active === i ? " active" : ""}`}
                  onClick={() => setActive(i)}
                >
                  <div className="how-step-num">{s.num}</div>
                  <div>
                    <div className="how-step-title">{s.title}</div>
                    <div className="how-step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </AnimateIn>

          {/* Visual */}
          <AnimateIn direction="right">
            <div
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 24,
                aspectRatio: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: -80,
                  right: -80,
                  width: 300,
                  height: 300,
                  background:
                    "radial-gradient(circle, rgba(74,126,255,0.12) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, scale: 0.85, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: -16 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 20,
                    textAlign: "center",
                    padding: 40,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      background: "linear-gradient(145deg, #1535e8, #4a7eff)",
                      borderRadius: 22,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 36,
                      boxShadow: "0 0 56px rgba(74,126,255,0.35)",
                    }}
                  >
                    {step.icon}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--color-gray-100)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--color-gray-500)",
                      maxWidth: 200,
                      lineHeight: 1.65,
                    }}
                  >
                    {step.visual}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}
