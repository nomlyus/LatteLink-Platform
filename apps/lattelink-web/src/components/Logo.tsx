import type { CSSProperties } from "react";

export function NomlyMark({
  className,
  style,
  size = 16,
}: {
  className?: string;
  style?: CSSProperties;
  size?: number;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        letterSpacing: "-0.025em",
        fontSize: size,
        lineHeight: 1,
        color: "var(--color-text)",
        ...style,
      }}
    >
      nomly
    </span>
  );
}

export function NomlyWordmark({
  className,
  style,
  size = 18,
}: {
  className?: string;
  style?: CSSProperties;
  size?: number;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        letterSpacing: "-0.025em",
        fontSize: size,
        lineHeight: 1,
        color: "var(--color-text)",
        ...style,
      }}
    >
      Nomly
    </span>
  );
}

/** Backwards compatible re-export for older imports. */
export const Wordmark = NomlyWordmark;
export function LogoIcon() {
  return null;
}
