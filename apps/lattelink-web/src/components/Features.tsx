"use client";

import { AnimateIn, Stagger, StaggerItem } from "./AnimateIn";

const features = [
  {
    icon: "📱",
    tag: "Launch",
    title: "Branded customer app",
    desc: "Launch with an iOS-first customer app under your brand on the App Store. Your colors, your menu, your loyalty flow, and your customer relationship.",
    span: 2,
    featured: true,
  },
  {
    icon: "⚡",
    title: "Real-time ordering",
    desc: "Orders appear on the client dashboard the instant customers place them. No polling, no delays.",
  },
  {
    icon: "🎯",
    title: "Built-in loyalty",
    desc: "Points, stamps, rewards — configured your way. Give customers a reason to come back.",
  },
  {
    icon: "📊",
    title: "Client dashboard",
    desc: "Manage your menu, track live orders, and run the day-to-day shop workflow without stitching multiple tools together.",
  },
  {
    icon: "🔔",
    title: "Push notifications",
    desc: "Send promotions and loyalty updates directly to your customers' phones. Owned channel, no algorithm.",
  },
  {
    icon: "💳",
    title: "Integrated payments",
    desc: "Card and wallet checkout can be configured without sending customers through a separate marketplace-style payment flow.",
  },
];

const proofItems = [
  {
    title: "Coffee only",
    desc: "LatteLink is built specifically for independent coffee shops, not every restaurant category at once.",
  },
  {
    title: "Pilot reality",
    desc: "The first release is being shaped around a real store workflow and a narrow launch plan instead of placeholder enterprise claims.",
  },
  {
    title: "Shop-team first",
    desc: "Menu changes, loyalty rules, live orders, and customer data live in one operating flow for the shop team.",
  },
  {
    title: "Flat-fee model",
    desc: "The platform is priced monthly so growth does not automatically mean giving up more of your margin.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="features-section"
      style={{ padding: "140px 0", position: "relative", zIndex: 1 }}
    >
      <style>{`
        .features-section {
          padding: 140px 0;
        }
        .feat-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 22px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          overflow: hidden;
          cursor: default;
          transition: border-color 0.3s, transform 0.3s;
        }
        .feat-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(74,126,255,0.5), transparent);
          opacity: 0;
          transition: opacity 0.35s;
        }
        .feat-card:hover { border-color: rgba(74,126,255,0.3); transform: translateY(-4px); }
        .feat-card:hover::before { opacity: 1; }
        .feat-card.featured {
          background: linear-gradient(135deg, rgba(21,53,232,0.14), rgba(74,126,255,0.04));
          border-color: rgba(74,126,255,0.18);
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        @media (max-width: 960px) {
          .features-section {
            padding: 110px 0;
          }
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .feat-card {
            padding: 26px;
          }
        }
        @media (max-width: 720px) {
          .features-section {
            padding: 92px 0;
          }
          .features-grid {
            grid-template-columns: 1fr;
          }
          .features-grid > * {
            grid-column: auto !important;
          }
        }
      `}</style>

      <div className="page-shell">
        {/* Header */}
        <div style={{ marginBottom: 80 }}>
          <AnimateIn>
            <SectionEye>Platform</SectionEye>
          </AnimateIn>
          <AnimateIn delay={0.05}>
            <SectionH>
              Everything your café needs.
              <br />
              Nothing it doesn&apos;t.
            </SectionH>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <SectionP>
              A focused ordering and loyalty stack for independent coffee shops,
              configured for your brand and launched without a custom software
              project.
            </SectionP>
          </AnimateIn>
        </div>

        {/* Grid */}
        <Stagger className="features-grid">
          {features.map((f) => (
            <StaggerItem
              key={f.title}
              style={f.span === 2 ? { gridColumn: "span 2" } : {}}
            >
              <div className={`feat-card${f.featured ? " featured" : ""}`}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    background: "rgba(74,126,255,0.1)",
                    border: "1px solid rgba(74,126,255,0.15)",
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  {f.icon}
                </div>
                {f.tag && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--color-blue-500)",
                      background: "rgba(74,126,255,0.1)",
                      borderRadius: 5,
                      padding: "3px 9px",
                      alignSelf: "flex-start",
                    }}
                  >
                    {f.tag}
                  </span>
                )}
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--color-gray-100)",
                    letterSpacing: "-0.022em",
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--color-gray-400)",
                    lineHeight: 1.75,
                  }}
                >
                  {f.desc}
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export function Statement() {
  return (
    <section
      style={{
        padding: "160px 0",
        textAlign: "center",
        position: "relative",
        zIndex: 1,
        overflow: "hidden",
      }}
    >
      <div
        className="statement-orb"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(74,126,255,0.08) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div className="page-shell">
        <AnimateIn>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(32px, 5vw, 64px)",
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              color: "var(--color-gray-100)",
              maxWidth: 860,
              margin: "0 auto",
            }}
          >
            <span style={{ color: "var(--color-gray-600)" }}>
              Independent coffee shops deserve
            </span>{" "}
            <span style={{ color: "var(--color-blue-500)" }}>
              the same technology{" "}
            </span>
            <span style={{ color: "var(--color-gray-600)" }}>
              as the big chains.
            </span>
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}

export function Logos() {
  return (
    <section
      id="proof"
      style={{
        padding: "72px 0",
        borderTop: "1px solid var(--color-border-s)",
        borderBottom: "1px solid var(--color-border-s)",
        position: "relative",
        zIndex: 1,
      }}
    >
      <style>{`
        .proof-head {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 32px;
          align-items: end;
          margin-bottom: 32px;
        }
        .proof-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .proof-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 20px;
          padding: 24px;
          min-height: 180px;
        }
        .proof-kicker {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--color-gray-600);
          margin-bottom: 10px;
        }
        .proof-title {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: var(--color-gray-100);
          margin-bottom: 10px;
        }
        .proof-copy {
          font-size: 14px;
          line-height: 1.75;
          color: var(--color-gray-400);
        }
        @media (max-width: 1040px) {
          .proof-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 860px) {
          .proof-head {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .proof-grid {
            grid-template-columns: 1fr;
          }
          .proof-card {
            min-height: 0;
          }
        }
      `}</style>
      <div className="page-shell">
        <div className="proof-head">
          <AnimateIn>
            <div>
              <SectionEye>Why Trust It</SectionEye>
              <SectionH>
                Early-stage does not have to mean vague.
              </SectionH>
            </div>
          </AnimateIn>
          <AnimateIn delay={0.05}>
            <SectionP>
              LatteLink is early, but the footing is concrete: coffee-only
              focus, pilot-stage rollout discipline, shop-team tooling, and
              pricing that does not depend on skimming each order.
            </SectionP>
          </AnimateIn>
        </div>
        <Stagger className="proof-grid">
          {proofItems.map((item) => (
            <StaggerItem key={item.title}>
              <div className="proof-card">
                <div className="proof-kicker">Proof</div>
                <div className="proof-title">{item.title}</div>
                <div className="proof-copy">{item.desc}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// Shared primitives
export function SectionEye({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--color-blue-500)",
        marginBottom: 18,
      }}
    >
      <span
        style={{ display: "block", width: 14, height: 1, background: "var(--color-blue-500)" }}
      />
      {children}
    </div>
  );
}

export function SectionH({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: "clamp(28px, 4vw, 48px)",
        letterSpacing: "-0.038em",
        lineHeight: 1.08,
        color: "var(--color-gray-100)",
        marginBottom: 18,
      }}
    >
      {children}
    </h2>
  );
}

export function SectionP({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 16,
        color: "var(--color-gray-400)",
        lineHeight: 1.75,
        maxWidth: 480,
      }}
    >
      {children}
    </p>
  );
}
