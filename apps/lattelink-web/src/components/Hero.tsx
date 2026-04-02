"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect } from "react";
import { demoHref } from "@/lib/site";
import { TrackedAnchor } from "./TrackedAnchor";

const ease = [0.16, 1, 0.3, 1] as const;

const proofPoints = [
  {
    label: "Current stage",
    value: "Pilot-ready",
    note: "Built around a real coffee-shop workflow and being prepared for the first live launch.",
  },
  {
    label: "Product focus",
    value: "Coffee only",
    note: "Designed specifically for independent cafés and repeat-ordering, not every restaurant category at once.",
  },
  {
    label: "Business model",
    value: "Flat monthly",
    note: "No LatteLink platform cut on every order as volume grows.",
  },
];

function AnimEntry({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export function Hero() {
  // Parallax mouse effect on orbs
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 40);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 30);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  return (
    <section
      className="hero-section"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "140px 40px 80px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        .hero-section {
          min-height: 100vh;
        }
        .hero-shell {
          position: relative;
          z-index: 1;
          width: 100%;
        }
        @keyframes orbFloat {
          0%,100% { transform: translate(0,0); }
          50% { transform: translate(0,-28px); }
        }
        .hero-btn {
          font-family: var(--font-body);
          font-size: 16px; font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #2a5fff, #4a7eff);
          border: none; border-radius: 12px;
          padding: 16px 36px;
          cursor: pointer; text-decoration: none;
          display: inline-flex; align-items: center; gap: 10px;
          box-shadow: 0 0 40px rgba(74,126,255,0.35);
          transition: opacity 0.2s, box-shadow 0.3s, transform 0.2s;
        }
        .hero-btn:hover {
          opacity: 0.93;
          box-shadow: 0 0 64px rgba(74,126,255,0.55);
          transform: translateY(-2px);
        }
        .hero-btn-ghost {
          font-family: var(--font-body);
          font-size: 16px; font-weight: 500;
          color: var(--color-gray-400);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 16px 36px;
          text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px;
          transition: border-color 0.2s, color 0.2s, transform 0.2s;
        }
        .hero-btn-ghost:hover {
          border-color: var(--color-blue-600);
          color: var(--color-gray-100);
          transform: translateY(-2px);
        }
        .mockup-frame {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 60px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03);
        }
        .m-nav-item {
          padding: 8px 10px; border-radius: 7px;
          font-size: 12px; color: var(--color-gray-500);
          display: flex; align-items: center; gap: 8px;
          transition: background 0.2s, color 0.2s;
          cursor: pointer;
        }
        .m-nav-item:hover { background: rgba(255,255,255,0.04); color: var(--color-gray-300); }
        .m-nav-item.active { background: rgba(74,126,255,0.12); color: var(--color-blue-400); }
        .hero-proof-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin: 0 auto 80px;
          max-width: 980px;
          text-align: left;
        }
        .hero-proof-card {
          background: rgba(17,19,32,0.72);
          border: 1px solid var(--color-border);
          border-radius: 18px;
          padding: 20px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .hero-cta-note {
          font-size: 13px;
          color: var(--color-gray-500);
          margin-top: -36px;
          margin-bottom: 56px;
        }
        .dashboard-body {
          padding: 24px;
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 16px;
          min-height: 380px;
        }
        .dashboard-sidebar {
          background: var(--color-bg-2);
          border: 1px solid var(--color-border-s);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .dashboard-stats {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 10px;
        }
        .dashboard-bottom {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          flex: 1;
        }
        @media (max-width: 1024px) {
          .hero-section {
            padding: 128px 24px 72px !important;
          }
          .hero-proof-grid {
            grid-template-columns: 1fr;
            max-width: 720px;
          }
        }
        @media (max-width: 820px) {
          .dashboard-body {
            grid-template-columns: 1fr;
          }
          .dashboard-sidebar {
            display: none;
          }
          .dashboard-stats,
          .dashboard-bottom {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .hero-section {
            padding: 116px 16px 64px !important;
          }
          .hero-btn,
          .hero-btn-ghost {
            width: 100%;
            justify-content: center;
          }
          .hero-cta-note {
            margin-top: -28px;
            margin-bottom: 48px;
            line-height: 1.6;
          }
          .dashboard-body {
            padding: 16px;
          }
        }
      `}</style>

      {/* Orbs */}
      <motion.div
        style={{
          position: "absolute",
          width: 700,
          height: 450,
          top: "8%",
          left: "50%",
          x: springX,
          y: springY,
          marginLeft: -350,
          background: "radial-gradient(ellipse, rgba(74,126,255,0.13) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />
      <motion.div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          bottom: "20%",
          left: "10%",
          x: springX,
          y: springY,
          background: "radial-gradient(circle, rgba(21,53,232,0.1) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <motion.div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          top: "30%",
          right: "8%",
          x: springX,
          y: springY,
          background: "radial-gradient(circle, rgba(74,126,255,0.08) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div className="page-shell hero-shell">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(74,126,255,0.08)",
            border: "1px solid rgba(74,126,255,0.2)",
            borderRadius: 100,
            padding: "6px 16px 6px 10px",
            marginBottom: 36,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-blue-400)",
            letterSpacing: "0.02em",
          }}
        >
          <PulseDot />
          Built for independent coffee shops
        </motion.div>

        {/* Headline */}
        <AnimEntry delay={0.2}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(48px, 7vw, 88px)",
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
              color: "var(--color-gray-100)",
              maxWidth: 900,
              margin: "0 auto 28px",
            }}
          >
            Your coffee house,{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #7aaaff 0%, #4a7eff 50%, #2a5fff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              fully connected.
            </span>
          </h1>
        </AnimEntry>

        {/* Subheadline */}
        <AnimEntry delay={0.35}>
          <p
            style={{
              fontSize: "clamp(16px, 2vw, 19px)",
              color: "var(--color-gray-400)",
              maxWidth: 520,
              margin: "0 auto 56px",
              lineHeight: 1.7,
            }}
          >
            LatteLink gives independent coffee shops a branded ordering app,
            loyalty program, and client dashboard without a giant software
            contract or a platform taking a cut of every order.
          </p>
        </AnimEntry>

        {/* CTAs */}
        <AnimEntry delay={0.5}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 64,
            }}
          >
            <TrackedAnchor
              href={demoHref}
              className="hero-btn"
              eventName="cta_click"
              eventProperties={{ placement: "hero", label: "request_pilot_intro", destination: "contact" }}
            >
              Request a pilot intro
              <ArrowRight />
            </TrackedAnchor>
            <TrackedAnchor
              href="#proof"
              className="hero-btn-ghost"
              eventName="section_navigation_click"
              eventProperties={{ placement: "hero", label: "why_cafes_take_the_call", destination: "proof" }}
            >
              Why cafés take the call
              <ArrowDown />
            </TrackedAnchor>
          </div>
        </AnimEntry>
        <AnimEntry delay={0.55}>
          <div className="hero-cta-note">
            Send the shop details once. We reply within one business day with
            fit feedback and the fastest path to a pilot launch.
          </div>
        </AnimEntry>

        {/* Proof */}
        <AnimEntry delay={0.65}>
          <div className="hero-proof-grid">
            {proofPoints.map((item) => (
              <div key={item.label} className="hero-proof-card">
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-gray-500)",
                    marginBottom: 10,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: "var(--color-gray-100)",
                    marginBottom: 8,
                  }}
                >
                  {item.value}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "var(--color-gray-400)",
                  }}
                >
                  {item.note}
                </div>
              </div>
            ))}
          </div>
        </AnimEntry>

        {/* Dashboard mockup */}
        <AnimEntry delay={0.7}>
          <div style={{ position: "relative", maxWidth: 1000, margin: "0 auto" }}>
            <div
              style={{
                position: "absolute",
                inset: -2,
                borderRadius: 26,
                background:
                  "linear-gradient(135deg, rgba(74,126,255,0.4) 0%, rgba(74,126,255,0.05) 40%, transparent 60%)",
                zIndex: -1,
                filter: "blur(1px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -80,
                left: "50%",
                transform: "translateX(-50%)",
                width: "80%",
                height: 80,
                background:
                  "radial-gradient(ellipse, rgba(74,126,255,0.25) 0%, transparent 70%)",
                filter: "blur(20px)",
                zIndex: -1,
              }}
            />
            <DashboardMockup />
          </div>
        </AnimEntry>
      </div>
    </section>
  );
}

function PulseDot() {
  return (
    <div style={{ position: "relative", width: 7, height: 7 }}>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--color-blue-500)",
        }}
      />
      <motion.div
        style={{
          position: "absolute",
          inset: -3,
          borderRadius: "50%",
          background: "var(--color-blue-500)",
          opacity: 0.3,
        }}
        animate={{ scale: [1, 2.5], opacity: [0.3, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M1 7.5h13M7.5 1l6.5 6.5-6.5 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1v12M1 7l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashboardMockup() {
  return (
    <div className="mockup-frame">
      {/* Top bar */}
      <div
        style={{
          background: "var(--color-bg-2)",
          borderBottom: "1px solid var(--color-border-s)",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 280,
            margin: "0 auto",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 11,
            color: "var(--color-gray-500)",
            fontFamily: "monospace",
            textAlign: "center",
          }}
        >
          operator.lattelink.app
        </div>
      </div>

      {/* Body */}
      <div
        className="dashboard-body"
      >
        {/* Sidebar */}
        <div className="dashboard-sidebar">
          {["Overview", "Orders", "Menu", "Loyalty", "Customers", "Analytics", "Settings"].map(
            (item, i) => (
              <div key={item} className={`m-nav-item${i === 0 ? " active" : ""}`}>
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "currentColor",
                    opacity: 0.7,
                  }}
                />
                {item}
              </div>
            )
          )}
        </div>

        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Stats */}
          <div className="dashboard-stats">
            {[
              { label: "Today's Orders", value: "148", delta: "↑ 12% vs yesterday" },
              { label: "Revenue", value: "$1,240", delta: "↑ 8% vs yesterday" },
              { label: "Active Members", value: "312", delta: "↑ 24 this week" },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "var(--color-bg-2)",
                  border: "1px solid var(--color-border-s)",
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--color-gray-600)",
                    marginBottom: 6,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--color-gray-100)",
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 10, color: "#34d399", marginTop: 2 }}>{s.delta}</div>
              </div>
            ))}
          </div>

          {/* Bottom row */}
          <div className="dashboard-bottom">
            {/* Chart */}
            <div
              style={{
                background: "var(--color-bg-2)",
                border: "1px solid var(--color-border-s)",
                borderRadius: 10,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--color-gray-600)",
                }}
              >
                Orders — Last 7 days
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 4,
                  height: 72,
                }}
              >
                {[42, 58, 48, 72, 62, 88, 100].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      borderRadius: "3px 3px 0 0",
                      background: "linear-gradient(180deg, #4a7eff 0%, #1535e8 100%)",
                      opacity: 0.5 + i * 0.08,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Orders */}
            <div
              style={{
                background: "var(--color-bg-2)",
                border: "1px solid var(--color-border-s)",
                borderRadius: 10,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--color-gray-600)",
                  marginBottom: 2,
                }}
              >
                Live Orders
              </div>
              {[
                { name: "Oat flat white", status: "New", color: "#4a7eff", bg: "rgba(74,126,255,0.15)" },
                { name: "Cold brew x2", status: "Ready", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
                { name: "Matcha latte", status: "Done", color: "var(--color-gray-500)", bg: "rgba(255,255,255,0.05)" },
                { name: "Espresso tonic", status: "New", color: "#4a7eff", bg: "rgba(74,126,255,0.15)" },
              ].map((o) => (
                <div
                  key={o.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    borderBottom: "1px solid var(--color-border-s)",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--color-gray-300)" }}>{o.name}</span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "2px 7px",
                      borderRadius: 4,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      color: o.color,
                      background: o.bg,
                    }}
                  >
                    {o.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
