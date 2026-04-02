"use client";

import { AnimateIn, Stagger, StaggerItem } from "./AnimateIn";
import { SectionEye, SectionH, SectionP } from "./Features";
import { demoHref } from "@/lib/site";
import { TrackedAnchor } from "./TrackedAnchor";

const plans = [
  {
    tier: "Starter",
    price: "$149",
    period: "/mo",
    desc: "Perfect for single-location cafés ready to go digital.",
    features: [
      "Branded iOS app",
      "Mobile ordering",
      "Basic loyalty program",
      "Client dashboard",
      "Push notifications",
      "Stripe payments",
    ],
    featured: false,
    cta: "Request intro",
  },
  {
    tier: "Growth",
    price: "$299",
    period: "/mo",
    desc: "For cafés serious about building a loyal customer base.",
    features: [
      "Everything in Starter",
      "Advanced loyalty & rewards",
      "Customer segmentation",
      "Targeted push campaigns",
      "Analytics & reporting",
      "Priority support",
    ],
    featured: true,
    badge: "Most Popular",
    cta: "Request intro",
  },
  {
    tier: "Enterprise",
    price: "Custom",
    period: "",
    desc: "Multi-location chains and franchises with custom needs.",
    features: [
      "Everything in Growth",
      "Multi-location support",
      "Custom integrations",
      "Dedicated onboarding",
      "SLA & uptime guarantee",
      "White-glove support",
    ],
    featured: false,
    cta: "Talk to us",
  },
];

export function Pricing() {
  return (
    <section id="pricing" style={{ padding: "140px 0", position: "relative", zIndex: 1 }}>
      <style>{`
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          align-items: stretch;
        }
        .p-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 22px;
          padding: 36px 32px;
          display: flex; flex-direction: column;
          position: relative;
          transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
          height: 100%;
        }
        .p-card:hover { transform: translateY(-4px); }
        .p-card.featured {
          border-color: rgba(74,126,255,0.35);
          background: linear-gradient(160deg, rgba(21,53,232,0.12), rgba(74,126,255,0.04));
          box-shadow: 0 0 60px rgba(74,126,255,0.08);
        }
        .p-card.featured:hover { box-shadow: 0 0 80px rgba(74,126,255,0.14); }
        .btn-p-out {
          font-family: var(--font-body);
          font-size: 14px; font-weight: 600;
          padding: 13px 24px; border-radius: 10px;
          text-decoration: none; display: block; text-align: center;
          color: var(--color-gray-300);
          background: transparent;
          border: 1px solid var(--color-border);
          transition: all 0.25s;
        }
        .btn-p-out:hover { border-color: var(--color-blue-600); color: var(--color-gray-100); }
        .btn-p-fill {
          font-family: var(--font-body);
          font-size: 14px; font-weight: 600;
          padding: 13px 24px; border-radius: 10px;
          text-decoration: none; display: block; text-align: center;
          color: #fff;
          background: linear-gradient(135deg, #2a5fff, #4a7eff);
          border: none;
          box-shadow: 0 0 28px rgba(74,126,255,0.3);
          transition: all 0.25s;
        }
        .btn-p-fill:hover { opacity: 0.9; box-shadow: 0 0 44px rgba(74,126,255,0.5); transform: translateY(-1px); }
        .pricing-note {
          margin-top: 24px;
          font-size: 13px;
          color: var(--color-gray-500);
          text-align: center;
        }
        @media (max-width: 1040px) {
          .pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 720px) {
          .pricing-grid {
            grid-template-columns: 1fr;
          }
          .p-card {
            padding: 30px 24px;
          }
        }
      `}</style>

      <div className="page-shell">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <AnimateIn>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SectionEye>Pricing</SectionEye>
            </div>
          </AnimateIn>
          <AnimateIn delay={0.05}>
            <SectionH>Simple, transparent pricing.</SectionH>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SectionP>
                Flat monthly pricing for shops that want branded repeat
                ordering, loyalty, and customer ownership without marketplace
                economics.
              </SectionP>
            </div>
          </AnimateIn>
        </div>

        {/* Cards */}
        <Stagger className="pricing-grid">
          {plans.map((p) => (
            <StaggerItem key={p.tier} style={{ height: "100%" }}>
              <div className={`p-card${p.featured ? " featured" : ""}`}>
                {p.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: -13,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "linear-gradient(135deg, #2a5fff, #4a7eff)",
                      color: "white",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "5px 16px",
                      borderRadius: 100,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.badge}
                  </div>
                )}

                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-gray-500)",
                    marginBottom: 16,
                  }}
                >
                  {p.tier}
                </div>

                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: p.price === "Custom" ? 34 : 48,
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    color: "var(--color-gray-100)",
                    lineHeight: 1,
                    marginBottom: 4,
                    paddingTop: p.price === "Custom" ? 8 : 0,
                  }}
                >
                  {p.price}
                  {p.period && (
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 400,
                        color: "var(--color-gray-500)",
                      }}
                    >
                      {p.period}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "var(--color-gray-500)",
                    marginBottom: 28,
                    paddingBottom: 28,
                    borderBottom: "1px solid var(--color-border-s)",
                  }}
                >
                  {p.desc}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 11,
                    flex: 1,
                    marginBottom: 28,
                  }}
                >
                  {p.features.map((f) => (
                    <div
                      key={f}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        fontSize: 13,
                        color: "var(--color-gray-400)",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--color-blue-500)",
                          flexShrink: 0,
                          marginTop: 1,
                          fontSize: 13,
                        }}
                      >
                        ✓
                      </span>
                      {f}
                    </div>
                  ))}
                </div>

                <TrackedAnchor
                  href={demoHref}
                  className={p.featured ? "btn-p-fill" : "btn-p-out"}
                  eventName="cta_click"
                  eventProperties={{
                    placement: "pricing",
                    label: p.cta.toLowerCase().replaceAll(" ", "_"),
                    plan: p.tier.toLowerCase(),
                    destination: "contact",
                  }}
                >
                  {p.cta}
                </TrackedAnchor>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <div className="pricing-note">
          LatteLink pricing is flat. The platform does not take an extra cut on
          each order as your volume grows.
        </div>
      </div>
    </section>
  );
}
