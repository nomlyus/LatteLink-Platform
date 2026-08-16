"use client";

import { Section, SectionHeader } from "./Sections";
import { AnimateIn, Stagger, StaggerItem } from "./AnimateIn";

const steps = [
  {
    num: "01",
    title: "Create your Nomly account",
    desc: "Start from nomly.us and enter one dashboard for your store profile, payments, menu, team, and branded app setup.",
  },
  {
    num: "02",
    title: "Design your app",
    desc: "Choose an approved template, arrange sections, edit content, preview the mobile experience, and publish the version you want reviewed.",
  },
  {
    num: "03",
    title: "Nomly handles the release",
    desc: "Once launch setup is complete, Nomly prepares the merchant-specific iOS build, manages review details, and tracks release progress.",
  },
  {
    num: "04",
    title: "Operate and iterate",
    desc: "After launch, orders, content, promotions, and customer-facing updates stay in the dashboard so most changes do not require a new binary.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how" variant="muted">
      <SectionHeader
        eyebrow="How it works"
        title="From account creation to App Store launch in one guided flow."
        lead="Nomly gives merchants a self-serve setup path while keeping app builds, release review, and production launch behind controlled platform gates."
      />

      <Stagger
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 24,
        }}
        className="how-grid"
      >
        {steps.map((s) => (
          <StaggerItem key={s.num}>
            <div style={{ height: "100%" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  color: "var(--color-text-subtle)",
                  marginBottom: 16,
                }}
              >
                {s.num}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.65,
                  color: "var(--color-text-muted)",
                }}
              >
                {s.desc}
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <AnimateIn>
        <div
          style={{
            marginTop: 56,
            paddingTop: 32,
            borderTop: "1px solid var(--color-border)",
            fontSize: 14,
            color: "var(--color-text-muted)",
          }}
        >
          The dashboard becomes the control plane for setup, launch review, and post-launch iteration.
        </div>
      </AnimateIn>

      <style jsx>{`
        @media (max-width: 980px) {
          :global(.how-grid) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 560px) {
          :global(.how-grid) {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Section>
  );
}
