import Link from "next/link";
import { NomlyMark } from "./Logo";
import { privacyPolicyPath, termsOfServicePath } from "@/lib/site";

const productLinks = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#solutions", label: "Solutions" },
];

const companyLinks = [
  { href: "/#nomly", label: "nomly" },
  { href: "/#contact", label: "Contact" },
];

const legalLinks = [
  { href: privacyPolicyPath, label: "Privacy" },
  { href: termsOfServicePath, label: "Terms" },
];

const year = new Date().getFullYear();

export function Footer() {
  return (
    <footer
      style={{
        background: "var(--color-bg)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div className="page-shell" style={{ paddingBlock: 64 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
            gap: 48,
          }}
          className="footer-grid"
        >
          <div>
            <Link
              href="/"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <NomlyMark size={20} />
            </Link>
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                lineHeight: 1.65,
                color: "var(--color-text-muted)",
                maxWidth: 320,
              }}
            >
              Nomly builds infrastructure for modern local commerce, starting
              with independent coffee shops.
            </p>
          </div>

          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Company" links={companyLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        <div
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-subtle)",
            }}
          >
            &copy; {year} Nomly.
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-subtle)",
            }}
          >
            Made for independent coffee shops.
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 520px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-text-subtle)",
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              style={{
                fontSize: 14,
                color: "var(--color-text-muted)",
                transition: "color 0.18s ease",
              }}
              className="footer-link"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <style>{`
        .footer-link:hover { color: var(--color-text) !important; }
      `}</style>
    </div>
  );
}
