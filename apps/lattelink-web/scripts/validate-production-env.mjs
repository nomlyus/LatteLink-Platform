import fs from "node:fs";

function parseDotenvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

function extractEmailAddress(value) {
  const trimmed = String(value ?? "").trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  return (bracketMatch?.[1] ?? trimmed).trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extractEmailAddress(value));
}

function isValidHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const target = (process.argv[2] ?? "production").trim();
const envFile = process.argv[3];
const env = {
  ...parseDotenvFile(envFile),
  ...process.env
};

const errors = [];
const warnings = [];

const webhookUrl = env.LATTELINK_CONTACT_WEBHOOK_URL?.trim() ?? "";
const webhookBearer = env.LATTELINK_CONTACT_WEBHOOK_BEARER_TOKEN?.trim() ?? "";
const resendKey = env.RESEND_API_KEY?.trim() ?? "";
const contactTo = env.LATTELINK_CONTACT_EMAIL_TO?.trim() ?? "";
const contactFrom = env.LATTELINK_CONTACT_EMAIL_FROM?.trim() ?? "";
const gaMeasurementId = env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

const hasWebhook = webhookUrl.length > 0;
const hasResend = resendKey.length > 0 || contactTo.length > 0 || contactFrom.length > 0;

if (hasWebhook && !isValidHttpsUrl(webhookUrl)) {
  errors.push("LATTELINK_CONTACT_WEBHOOK_URL must be an https URL.");
}

if (!hasWebhook && webhookBearer) {
  warnings.push(
    "LATTELINK_CONTACT_WEBHOOK_BEARER_TOKEN is set without LATTELINK_CONTACT_WEBHOOK_URL; the bearer token will be ignored."
  );
}

if (hasResend) {
  if (!resendKey) {
    errors.push("RESEND_API_KEY is required when using Resend delivery.");
  }
  if (!contactTo) {
    errors.push("LATTELINK_CONTACT_EMAIL_TO is required when using Resend delivery.");
  } else if (!isValidEmail(contactTo)) {
    errors.push("LATTELINK_CONTACT_EMAIL_TO must be a valid email address.");
  }
  if (!contactFrom) {
    errors.push("LATTELINK_CONTACT_EMAIL_FROM is required when using Resend delivery.");
  } else if (!isValidEmail(contactFrom)) {
    errors.push("LATTELINK_CONTACT_EMAIL_FROM must be a valid email address.");
  }
}

if (!hasWebhook && !hasResend) {
  if (target === "production") {
    errors.push(
      "Production requires either webhook delivery or Resend email delivery for the pilot intro form."
    );
  } else {
    warnings.push(
      `${target} has no lead delivery sink configured; pilot intro submissions will fall back to the friendly not-configured message.`
    );
  }
}

if (gaMeasurementId) {
  if (!/^G-[A-Z0-9]+$/i.test(gaMeasurementId)) {
    errors.push("NEXT_PUBLIC_GA_MEASUREMENT_ID should look like a GA4 measurement ID (for example G-ABC123XYZ).");
  }
} else if (target === "production") {
  warnings.push("NEXT_PUBLIC_GA_MEASUREMENT_ID is not set; production traffic and CTA events will not be measured.");
}

const title = `[lattelink-web release check] ${target}`;
if (errors.length > 0) {
  console.error(title);
  for (const error of errors) {
    console.error(`- ERROR: ${error}`);
  }
  for (const warning of warnings) {
    console.error(`- WARN: ${warning}`);
  }
  process.exit(1);
}

console.log(title);
console.log("- PASS: release env is valid for the selected environment.");
for (const warning of warnings) {
  console.log(`- WARN: ${warning}`);
}
