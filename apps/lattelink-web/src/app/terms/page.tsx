import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/About";
import { Nav } from "@/components/Nav";
import { contactEmail, privacyPolicyPath, siteName, termsOfServicePath, termsOfServiceUrl } from "@/lib/site";

const lastUpdated = "April 10, 2026";

const sections = [
  {
    title: "About LatteLink",
    body: [
      `${siteName} provides branded mobile ordering, loyalty, and customer account tools for independent coffee shops. These Terms govern your use of any ${siteName}-powered ordering experience, the ${siteName} marketing website, and any related services (collectively, the "Service").`,
      `By creating an account or placing an order through a ${siteName}-powered experience, you agree to these Terms. If you do not agree, do not use the Service.`
    ]
  },
  {
    title: "Accounts",
    body: [
      "You must provide accurate information when creating an account and keep it up to date.",
      "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.",
      "You must be at least 13 years old to create an account. The Service is not intended for children under 13.",
      "You may delete your account at any time from the app settings."
    ]
  },
  {
    title: "Orders and payments",
    body: [
      "Orders placed through a LatteLink-powered experience are fulfilled by the coffee shop operating that experience, not by LatteLink directly.",
      "Payments are processed through Clover, a third-party payment processor. By completing a payment you also agree to Clover's applicable terms and policies.",
      "LatteLink does not store full payment card numbers. Payment tokens and transaction records are retained as described in the Privacy Policy.",
      "Refunds and order disputes are subject to the refund policy of the coffee shop you ordered from. Contact the shop directly or reach us at the address below if you need assistance."
    ]
  },
  {
    title: "Loyalty and rewards",
    body: [
      "Loyalty points and rewards are issued at the discretion of the coffee shop operating the branded experience.",
      "Points and rewards have no cash value and cannot be transferred, sold, or exchanged outside of the Service.",
      "LatteLink and the coffee shop reserve the right to adjust, expire, or discontinue loyalty programs at any time with reasonable notice."
    ]
  },
  {
    title: "Acceptable use",
    body: [
      "You agree not to use the Service to violate any applicable law or regulation.",
      "You agree not to attempt to gain unauthorized access to any part of the Service, its infrastructure, or other users' accounts.",
      "You agree not to use the Service to transmit spam, malicious code, or fraudulent orders.",
      "We reserve the right to suspend or terminate accounts that violate these Terms."
    ]
  },
  {
    title: "Intellectual property",
    body: [
      `The ${siteName} name, logo, and platform are owned by LatteLink. Nothing in these Terms grants you a right to use our trademarks or brand assets.`,
      "Coffee shop branding displayed within a powered experience remains the property of the respective coffee shop."
    ]
  },
  {
    title: "Disclaimers",
    body: [
      `The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.`,
      "We do not guarantee that the Service will be uninterrupted, error-free, or free of harmful components.",
      "Menu availability, pricing, and hours are set by each coffee shop and may change without notice."
    ]
  },
  {
    title: "Limitation of liability",
    body: [
      "To the fullest extent permitted by applicable law, LatteLink and its affiliates will not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service.",
      "Our total liability to you for any claim arising out of or related to these Terms or the Service will not exceed the greater of the amount you paid to LatteLink in the twelve months preceding the claim or $50 USD."
    ]
  },
  {
    title: "Changes to these Terms",
    body: [
      "We may update these Terms from time to time. When we do, we will update the date at the top of this page and post the revised version at this same URL.",
      "Continued use of the Service after changes are posted constitutes your acceptance of the updated Terms."
    ]
  },
  {
    title: "Governing law",
    body: [
      "These Terms are governed by the laws of the jurisdiction in which LatteLink operates, without regard to conflict of law principles.",
      "Any disputes will be resolved in the courts of competent jurisdiction in that location."
    ]
  }
];

export const metadata: Metadata = {
  title: `Terms of Service | ${siteName}`,
  description: `Terms of Service for ${siteName} and LatteLink-powered ordering experiences.`,
  alternates: {
    canonical: termsOfServicePath
  },
  openGraph: {
    title: `Terms of Service | ${siteName}`,
    description: `Terms of Service for ${siteName} and LatteLink-powered ordering experiences.`,
    url: termsOfServiceUrl
  }
};

export default function TermsOfServicePage() {
  return (
    <>
      <Nav />
      <main style={{ padding: "120px 0 96px", position: "relative", zIndex: 1 }}>
        <style>{`
          .legal-shell {
            width: min(880px, calc(100% - 48px));
            margin: 0 auto;
          }
          .legal-card {
            background: linear-gradient(180deg, rgba(17,19,32,0.96), rgba(9,9,15,0.98));
            border: 1px solid rgba(74,126,255,0.16);
            border-radius: 32px;
            padding: 48px;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
          }
          .legal-kicker {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 999px;
            border: 1px solid rgba(74,126,255,0.2);
            background: rgba(74,126,255,0.08);
            color: var(--color-blue-300);
            font-size: 12px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }
          .legal-title {
            margin-top: 22px;
            font-family: var(--font-display);
            font-size: clamp(34px, 6vw, 60px);
            line-height: 0.98;
            letter-spacing: -0.04em;
            color: var(--color-gray-100);
          }
          .legal-subtitle {
            margin-top: 18px;
            font-size: 16px;
            line-height: 1.8;
            color: var(--color-gray-400);
            max-width: 680px;
          }
          .legal-meta {
            margin-top: 18px;
            color: var(--color-gray-500);
            font-size: 13px;
            letter-spacing: 0.02em;
          }
          .legal-sections {
            margin-top: 42px;
            display: grid;
            gap: 18px;
          }
          .legal-section {
            border: 1px solid var(--color-border);
            border-radius: 24px;
            background: rgba(17,19,32,0.72);
            padding: 28px 28px 26px;
          }
          .legal-section h2 {
            font-family: var(--font-display);
            font-size: 24px;
            line-height: 1.15;
            letter-spacing: -0.03em;
            color: var(--color-gray-100);
          }
          .legal-section p,
          .legal-section li {
            font-size: 15px;
            line-height: 1.8;
            color: var(--color-gray-300);
          }
          .legal-section ul {
            margin-top: 14px;
            padding-left: 20px;
            display: grid;
            gap: 10px;
          }
          .legal-section p + p {
            margin-top: 12px;
          }
          .legal-contact {
            margin-top: 28px;
            padding: 22px 24px;
            border-radius: 22px;
            border: 1px solid rgba(74,126,255,0.18);
            background: rgba(74,126,255,0.06);
          }
          .legal-contact a,
          .legal-home-link {
            color: var(--color-blue-300);
            text-decoration: none;
          }
          .legal-home-link:hover,
          .legal-contact a:hover {
            color: var(--color-gray-100);
          }
          @media (max-width: 720px) {
            .legal-card {
              padding: 32px 22px;
              border-radius: 24px;
            }
            .legal-section {
              padding: 22px 18px;
              border-radius: 18px;
            }
          }
        `}</style>

        <div className="legal-shell">
          <div className="legal-card">
            <div className="legal-kicker">Terms of Service</div>
            <h1 className="legal-title">Terms for LatteLink-powered ordering.</h1>
            <p className="legal-subtitle">
              These Terms of Service govern your use of the LatteLink platform and any mobile ordering experience
              powered by LatteLink. Please read them carefully before using the Service.
            </p>
            <div className="legal-meta">Last updated {lastUpdated}</div>

            <div className="legal-sections">
              {sections.map((section) => (
                <section key={section.title} className="legal-section">
                  <h2>{section.title}</h2>
                  {section.body.length === 1 ? (
                    <p style={{ marginTop: 14 }}>{section.body[0]}</p>
                  ) : section.title === "Accounts" ||
                    section.title === "Orders and payments" ||
                    section.title === "Loyalty and rewards" ||
                    section.title === "Acceptable use" ||
                    section.title === "Intellectual property" ? (
                    <ul>
                      {section.body.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      {section.body.map((entry) => (
                        <p key={entry} style={{ marginTop: 14 }}>
                          {entry}
                        </p>
                      ))}
                    </>
                  )}
                </section>
              ))}
            </div>

            <div className="legal-contact">
              <p style={{ fontSize: 15, lineHeight: 1.8, color: "var(--color-gray-300)" }}>
                Questions about these Terms can be sent to{" "}
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. You can also review our{" "}
                <Link href={privacyPolicyPath} className="legal-home-link">
                  Privacy Policy
                </Link>{" "}
                or return to the{" "}
                <Link href="/" className="legal-home-link">
                  LatteLink homepage
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
