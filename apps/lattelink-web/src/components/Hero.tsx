"use client";

import { motion } from "framer-motion";
import { demoHref, merchantStartHref } from "@/lib/site";
import { TrackedAnchor } from "./TrackedAnchor";
import { buttonStyles } from "./Sections";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section
      style={{
        paddingTop: 120,
        paddingBottom: 120,
        background: "var(--color-bg)",
      }}
    >
      <div
        className="page-shell"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-muted)",
            borderRadius: 999,
            padding: "6px 12px",
            marginBottom: 32,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-text)",
            }}
          />
          LatteLink by nomly
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.05 }}
          style={{
            fontSize: "clamp(40px, 6.4vw, 76px)",
            fontWeight: 600,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
            margin: 0,
            maxWidth: 880,
          }}
        >
          Create your own branded ordering app.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.15 }}
          style={{
            marginTop: 28,
            maxWidth: 620,
            fontSize: 19,
            lineHeight: 1.55,
            color: "var(--color-text-muted)",
          }}
        >
          Nomly gives independent coffee shops one place to design, launch,
          and operate a branded iOS ordering app with payments, menu control,
          customer ownership, and App Store release support built in.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.25 }}
          style={{
            marginTop: 40,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <TrackedAnchor
            href={merchantStartHref}
            style={buttonStyles("primary")}
            eventName="cta_click"
            eventProperties={{
              placement: "hero",
              label: "start_building",
              destination: "client_dashboard",
            }}
          >
            Start building
          </TrackedAnchor>
          <TrackedAnchor
            href={demoHref}
            style={buttonStyles("secondary")}
            eventName="cta_click"
            eventProperties={{
              placement: "hero",
              label: "request_walkthrough",
              destination: "contact",
            }}
          >
            Request walkthrough
          </TrackedAnchor>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease, delay: 0.4 }}
          style={{
            marginTop: 64,
            fontSize: 13,
            color: "var(--color-text-subtle)",
            letterSpacing: "0.02em",
          }}
        >
          Self-serve setup with Nomly-managed review, build, and App Store launch
        </motion.div>
      </div>
    </section>
  );
}
