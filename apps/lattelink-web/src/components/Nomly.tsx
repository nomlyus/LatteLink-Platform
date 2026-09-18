"use client";

import { Section, Heading, Lead } from "./Sections";
import { AnimateIn } from "./AnimateIn";
import { parentTagline } from "@/lib/site";

export function Nomly() {
  return (
    <Section id="nomly" variant="invert">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
          gap: 64,
          alignItems: "start",
        }}
        className="nomly-grid"
      >
        <AnimateIn>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-text-invert-muted)",
            }}
          >
            Nomly for independent coffee shops
          </div>
          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              letterSpacing: "-0.03em",
              fontSize: 34,
              color: "var(--color-text-invert)",
              lineHeight: 1,
            }}
          >
            nomly
          </div>
        </AnimateIn>

        <div>
          <AnimateIn>
            <Heading level={2} invert>
              {parentTagline}
            </Heading>
          </AnimateIn>
          <AnimateIn delay={0.05}>
            <div style={{ marginTop: 24 }}>
              <Lead invert maxWidth={640}>
                Nomly is building the digital
                surface area that small, independent operators need to compete
                with the chains. We are purpose-built for coffee shops.
              </Lead>
            </div>
          </AnimateIn>

          <AnimateIn delay={0.1}>
            <ul
              style={{
                marginTop: 40,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 24,
                listStyle: "none",
                padding: 0,
                borderTop: "1px solid var(--color-border-invert)",
                paddingTop: 32,
              }}
              className="nomly-stats"
            >
              {[
                { k: "Platform", v: "Local commerce infrastructure" },
                { k: "Coffee focus", v: "Independent coffee shops" },
                { k: "Stage", v: "Founder-led, pilot rollout" },
              ].map((s) => (
                <li key={s.k}>
                  <div
                    style={{
                      fontSize: 12,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--color-text-invert-muted)",
                      marginBottom: 8,
                    }}
                  >
                    {s.k}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: "var(--color-text-invert)",
                    }}
                  >
                    {s.v}
                  </div>
                </li>
              ))}
            </ul>
          </AnimateIn>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 860px) {
          :global(#nomly > .page-shell > div) {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          :global(.nomly-stats) {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
        }
      `}</style>
    </Section>
  );
}
