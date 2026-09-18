import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/About";
import { Nav } from "@/components/Nav";
import { privacyPolicyPath, privacyPolicyUrl, siteName } from "@/lib/site";

const lastUpdated = "September 18, 2026";

const sections = [
  {
    title: "What this policy covers",
    body: [
      `${siteName} provides branded ordering, loyalty, and customer-account tools for independent coffee shops. This policy explains how we collect, use, and share personal information when someone visits our website, submits a contact request, or uses a mobile ordering experience powered by ${siteName}.`,
      `When a coffee shop uses ${siteName}, we may process information on behalf of that coffee shop so customers can sign in, place orders, earn rewards, receive notifications, and manage their account.`
    ]
  },
  {
    title: "Information we collect",
    body: [
      "Account and profile details, such as name, email address, phone number, birthday, and sign-in method.",
      "Order and loyalty data, such as items ordered, pickup timing, rewards balances, reward activity, and order history.",
      "Device and app information, such as push notification tokens, device identifiers needed for notifications, and technical session data.",
      "Payment and transaction information, such as payment status, payment tokens supplied by Apple Pay or other payment providers, transaction IDs, and refund records. We do not intend to store full payment card numbers in our ordering backend.",
      "Website contact information, such as the details you submit through the Nomly website contact form.",
      "Website analytics information, such as page visits and interaction events on the Nomly marketing site when analytics is enabled."
    ]
  },
  {
    title: "How we use information",
    body: [
      "To create and secure customer accounts.",
      "To process orders, loyalty activity, refunds, and account support requests.",
      "To send important account or order messages, including push notifications when enabled.",
      "To operate, monitor, and improve the Nomly platform and its reliability.",
      "To respond to sales or pilot-intro inquiries submitted through the Nomly website.",
      "To meet legal, security, fraud-prevention, bookkeeping, and compliance obligations."
    ]
  },
  {
    title: "How information may be shared",
    body: [
      "With the coffee shop operating the branded experience you are using.",
      "With service providers that help us host the product, deliver email, support analytics, or process payments.",
      "With payment providers involved in completing a transaction, such as Apple Pay wallet processing and downstream payment processors.",
      "When required by law, legal process, or a valid request from regulators or courts.",
      "As part of a business transfer if Nomly is reorganized, acquired, or sells assets, subject to applicable law."
    ]
  },
  {
    title: "Retention",
    body: [
      "We keep information for as long as it is reasonably needed to operate the service, maintain records, resolve disputes, prevent fraud, and satisfy legal obligations.",
      "If you delete your account from the mobile app, we aim to remove the customer account data tied to that account from our active systems, subject to any records we must retain for legal, tax, fraud-prevention, or accounting reasons."
    ]
  },
  {
    title: "Your choices",
    body: [
      "You can manage or update profile details from the app where available.",
      "You can disable notifications at the device level.",
      "You can delete your account from the app settings. If you signed in with Apple, we also attempt to revoke the linked Sign in with Apple token during deletion.",
      "You can contact us to ask privacy questions or request help regarding your data."
    ]
  },
  {
    title: "Children",
    body: [
      `${siteName} is not intended for children under 13, and we do not intend to knowingly collect personal information from children under 13.`
    ]
  },
  {
    title: "Changes to this policy",
    body: [
      "We may update this privacy policy from time to time. When we do, we will update the date at the top of this page and post the revised version at this same URL."
    ]
  }
];

export const metadata: Metadata = {
  title: `Privacy Policy | ${siteName}`,
  description: `Privacy Policy for ${siteName} and branded coffee-shop ordering experiences.`,
  alternates: {
    canonical: privacyPolicyPath
  },
  openGraph: {
    title: `Privacy Policy | ${siteName}`,
    description: `Privacy Policy for ${siteName} and branded coffee-shop ordering experiences.`,
    url: privacyPolicyUrl
  }
};

export default function PrivacyPolicyPage() {
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
          <div className="legal-kicker">Privacy Policy</div>
          <h1 className="legal-title">Privacy for Nomly.</h1>
          <p className="legal-subtitle">
            This page explains what information Nomly may collect, how it is used, and what choices people have
            when they use the Nomly website or a branded mobile ordering experience powered by Nomly.
          </p>
          <div className="legal-meta">Last updated {lastUpdated}</div>

          <hr className="legal-divider" />

          <div className="legal-sections">
            {sections.map((section) => (
              <section key={section.title} className="legal-section">
                <h2>{section.title}</h2>
                {section.body.length === 1 ? (
                  <p>{section.body[0]}</p>
                ) : section.title === "Information we collect" ||
                  section.title === "How we use information" ||
                  section.title === "How information may be shared" ||
                  section.title === "Your choices" ? (
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
            Questions about this policy can be submitted through our{" "}
            <Link href="/#contact" className="legal-home-link">contact form</Link>. You can also return to the{" "}
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
