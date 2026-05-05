import { contactEmail, siteDescription, siteName, siteUrl } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
      email: contactEmail,
    },
    {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
      description: siteDescription,
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
