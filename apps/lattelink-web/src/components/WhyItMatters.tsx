"use client";

import { Section, SectionHeader } from "./Sections";
import { AnimateIn, Stagger, StaggerItem } from "./AnimateIn";

const points = [
  {
    title: "Own the customer relationship",
    desc: "Every transaction lives in your shop's brand and your customer list — not behind a marketplace login.",
  },
  {
    title: "Keep more of every order",
    desc: "Flat monthly pricing replaces percentage-based marketplace economics that scale against you.",
  },
  {
    title: "Look like a serious brand",
    desc: "A polished, native ordering experience that holds its own next to the chains your customers compare you to.",
  },
  {
    title: "Built for the way you actually run service",
    desc: "Designed around real coffee operations — drinks, modifiers, peak rushes, regulars — not generic restaurant flow.",
  },
];

export function WhyItMatters() {
  return (
    <Section id="solutions">
      <SectionHeader
        eyebrow="Why it matters"
        title="Independent coffee shops should not have to choose between marketplaces and DIY."
        lead="Nomly is built for the shops in between — the ones who care about brand, loyalty, and a direct customer relationship."
      />

      <Stagger
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 0,
          borderTop: "1px solid var(--color-border)",
        }}
        className="why-grid"
      >
        {points.map((p) => (
          <StaggerItem
            key={p.title}
            style={{
              borderBottom: "1px solid var(--color-border)",
              borderRight: "1px solid var(--color-border)",
            }}
          >
            <div style={{ padding: "36px 32px 36px 0" }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  marginBottom: 12,
                }}
              >
                {p.title}
              </div>
              <div
                style={{
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "var(--color-text-muted)",
                  maxWidth: 460,
                }}
              >
                {p.desc}
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <AnimateIn>
        <div
          style={{
            marginTop: 48,
            fontSize: 14,
            color: "var(--color-text-muted)",
          }}
        >
          Currently in pilot with independent coffee shops. Limited cohort each
          quarter.
        </div>
      </AnimateIn>

      <style jsx>{`
        @media (max-width: 720px) {
          :global(.why-grid) {
            grid-template-columns: 1fr;
          }
          :global(.why-grid > div) {
            border-right: none !important;
            padding-right: 0 !important;
          }
        }
      `}</style>
    </Section>
  );
}
