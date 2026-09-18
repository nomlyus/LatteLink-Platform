"use client";

import { Section, Heading, Lead } from "./Sections";
import { LeadCapture } from "./LeadCapture";
import { AnimateIn } from "./AnimateIn";

export function Contact() {
  return (
    <Section id="contact" variant="muted">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)",
          gap: 64,
          alignItems: "start",
        }}
        className="contact-grid"
      >
        <AnimateIn>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginBottom: 20,
            }}
          >
            Contact
          </div>
          <Heading level={2}>Talk to the Nomly team.</Heading>
          <div style={{ marginTop: 20 }}>
            <Lead maxWidth={520}>
              Tell us about your shop. We reply within one business day to
              confirm fit and schedule a walkthrough.
            </Lead>
          </div>
        </AnimateIn>

        <AnimateIn delay={0.05}>
          <LeadCapture />
        </AnimateIn>
      </div>

      <style jsx>{`
        @media (max-width: 920px) {
          :global(.contact-grid) {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </Section>
  );
}
