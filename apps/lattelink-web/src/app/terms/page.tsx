import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/About";
import { Nav } from "@/components/Nav";
import { privacyPolicyPath, siteName, termsOfServicePath, termsOfServiceUrl } from "@/lib/site";

const lastUpdated = "September 18, 2026";

const sections = [
  {
    title: "About Nomly",
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
      "Orders placed through a coffee shop's branded experience are fulfilled by the coffee shop operating that experience, not by Nomly directly.",
      "Payments are processed through Stripe. Where available, Apple Pay is offered through Stripe. By completing a payment, you may also be subject to Stripe's and the applicable wallet provider's terms and policies.",
      "Nomly does not store full payment card numbers. Payment tokens and transaction records are retained as described in the Privacy Policy.",
      "Refunds and order disputes are subject to the refund policy of the coffee shop you ordered from. Contact the shop directly or use the Nomly contact form if you need assistance."
    ]
  },
  {
    title: "Loyalty and rewards",
    body: [
      "Loyalty points and rewards are issued at the discretion of the coffee shop operating the branded experience.",
      "Points and rewards have no cash value and cannot be transferred, sold, or exchanged outside of the Service.",
      "Nomly and the coffee shop reserve the right to adjust, expire, or discontinue loyalty programs at any time with reasonable notice."
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
      `The ${siteName} name, logo, and platform are owned by Nomly. Nothing in these Terms grants you a right to use our trademarks or brand assets.`,
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
      "To the fullest extent permitted by applicable law, Nomly and its affiliates will not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service.",
      "Our total liability to you for any claim arising out of or related to these Terms or the Service will not exceed the greater of the amount you paid for the Service in the twelve months preceding the claim or $50 USD."
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
      "These Terms are governed by the laws of the jurisdiction in which Nomly operates, without regard to conflict of law principles.",
      "Any disputes will be resolved in the courts of competent jurisdiction in that location."
    ]
  }
];

export const metadata: Metadata = {
  title: `Terms of Service | ${siteName}`,
  description: `Terms of Service for ${siteName} and branded coffee-shop ordering experiences.`,
  alternates: {
    canonical: termsOfServicePath
  },
  openGraph: {
    title: `Terms of Service | ${siteName}`,
    description: `Terms of Service for ${siteName} and branded coffee-shop ordering experiences.`,
    url: termsOfServiceUrl
  }
};

export default function TermsOfServicePage() {
  return (
    <>
      <Nav />
      <main style={{ paddingBlock: "80px 96px" }}>
        <style>{`
          .legal-shell {
            width: min(800px, calc(100% - 48px));
            margin: 0 auto;
          }
          .legal-kicker {
            display: inline-block;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: var(--color-text-muted);
            margin-bottom: 20px;
          }
          .legal-title {
            font-size: clamp(30px, 4vw, 48px);
            font-weight: 600;
            letter-spacing: -0.03em;
            line-height: 1.1;
            color: var(--color-text);
            margin: 0 0 16px;
          }
          .legal-subtitle {
            font-size: 16px;
            line-height: 1.7;
            color: var(--color-text-muted);
            max-width: 640px;
            margin: 0 0 8px;
          }
          .legal-meta {
            font-size: 13px;
            color: var(--color-text-subtle);
          }
          .legal-divider {
            border: none;
            border-top: 1px solid var(--color-border);
            margin: 40px 0;
          }
          .legal-sections {
            display: grid;
            gap: 0;
          }
          .legal-section {
            padding: 28px 0;
            border-bottom: 1px solid var(--color-border);
          }
          .legal-section:first-child {
            border-top: 1px solid var(--color-border);
          }
          .legal-section h2 {
            font-size: 17px;
            font-weight: 600;
            letter-spacing: -0.02em;
            color: var(--color-text);
            margin: 0 0 12px;
          }
          .legal-section p,
          .legal-section li {
            font-size: 15px;
            line-height: 1.75;
            color: var(--color-text-muted);
          }
          .legal-section ul {
            padding-left: 20px;
            display: grid;
            gap: 8px;
          }
          .legal-section p + p {
            margin-top: 12px;
          }
          .legal-contact {
            margin-top: 40px;
            padding: 20px 24px;
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
            background: var(--color-bg-muted);
            font-size: 14px;
            line-height: 1.7;
            color: var(--color-text-muted);
          }
          .legal-contact a,
          .legal-home-link {
            color: var(--color-text);
            text-decoration: underline;
            text-underline-offset: 3px;
          }
          @media (max-width: 720px) {
            .legal-shell {
              width: calc(100% - 40px);
            }
          }
        `}</style>

        <div className="legal-shell">
          <div className="legal-kicker">Terms of Service</div>
          <h1 className="legal-title">Terms for Nomly.</h1>
          <p className="legal-subtitle">
            These Terms of Service govern your use of the Nomly platform and any branded mobile ordering experience
            powered by Nomly. Please read them carefully before using the Service.
          </p>
          <div className="legal-meta">Last updated {lastUpdated}</div>

          <hr className="legal-divider" />

          <div className="legal-sections">
            {sections.map((section) => (
              <section key={section.title} className="legal-section">
                <h2>{section.title}</h2>
                {section.body.length === 1 ? (
                  <p>{section.body[0]}</p>
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
                      <p key={entry}>{entry}</p>
                    ))}
                  </>
                )}
              </section>
            ))}
          </div>

          <div className="legal-contact">
            Questions about these Terms can be submitted through our{" "}
            <Link href="/#contact" className="legal-home-link">contact form</Link>. You can also review our{" "}
            <Link href={privacyPolicyPath} className="legal-home-link">
              Privacy Policy
            </Link>{" "}
            or return to the{" "}
            <Link href="/" className="legal-home-link">
              Nomly homepage
            </Link>
            .
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
