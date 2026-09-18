import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "radial-gradient(circle at top right, rgba(74,126,255,0.22), transparent 38%), linear-gradient(180deg, #0b0d16 0%, #09090f 100%)",
          color: "#f4f7ff",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "linear-gradient(135deg, #2a5fff, #4a7eff)",
              boxShadow: "0 0 42px rgba(74,126,255,0.45)",
            }}
          />
          Nomly
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
          <div style={{ fontSize: 74, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.06em" }}>
            Branded ordering and loyalty for independent coffee shops.
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "#b3bdd7" }}>
            Launch a branded ordering app, loyalty program, and client dashboard without
            marketplace economics.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#7f8db6",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <div>Pilot-ready</div>
          <div>Coffee only</div>
          <div>Flat monthly</div>
        </div>
      </div>
    ),
    size,
  );
}
