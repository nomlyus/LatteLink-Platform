const VALID_VARIANTS = new Set(["beta", "production"]);
const REQUIRED_KEYS = [
  "APP_VARIANT",
  "EXPO_PUBLIC_APP_VARIANT",
  "APP_DISPLAY_NAME_BASE",
  "APP_VERSION",
  "EXPO_SLUG",
  "EXPO_SCHEME",
  "IOS_BUNDLE_IDENTIFIER",
  "EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER",
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID",
  "EXPO_PUBLIC_BRAND_NAME"
];

const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const profileArg = cliArgs[0] ?? process.env.EAS_BUILD_PROFILE ?? process.env.APP_VARIANT;
const profile = typeof profileArg === "string" ? profileArg.trim() : "";

if (!VALID_VARIANTS.has(profile)) {
  console.error(
    `[mobile release check] Expected profile argument or env to be one of: beta, production. Received: ${profile || "<empty>"}`
  );
  process.exit(1);
}

const errors = [];
const warnings = [];

for (const key of REQUIRED_KEYS) {
  if (!process.env[key]?.trim()) {
    errors.push(`Missing required env: ${key}`);
  }
}

const variant = process.env.APP_VARIANT?.trim();
if (variant && variant !== profile) {
  errors.push(`APP_VARIANT must match the target profile. Expected ${profile}, received ${variant}.`);
}

const publicVariant = process.env.EXPO_PUBLIC_APP_VARIANT?.trim();
if (publicVariant && publicVariant !== profile) {
  errors.push(`EXPO_PUBLIC_APP_VARIANT must match the target profile. Expected ${profile}, received ${publicVariant}.`);
}

const appVersion = process.env.APP_VERSION?.trim() ?? "";
if (appVersion && !/^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(appVersion)) {
  errors.push(`APP_VERSION must look like a semantic version. Received: ${appVersion}`);
}

const slug = process.env.EXPO_SLUG?.trim() ?? "";
if (slug === "example" || slug.includes(" ")) {
  errors.push(`EXPO_SLUG must be a valid Expo slug. Received: ${slug}`);
}

const scheme = process.env.EXPO_SCHEME?.trim() ?? "";
if (scheme && !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
  errors.push(`EXPO_SCHEME must be URL-scheme safe. Received: ${scheme}`);
}

const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER?.trim() ?? "";
const publicBundleIdentifier = process.env.EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER?.trim() ?? "";
if (bundleIdentifier && publicBundleIdentifier && bundleIdentifier !== publicBundleIdentifier) {
  errors.push(
    `EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER must match IOS_BUNDLE_IDENTIFIER. Expected ${bundleIdentifier}, received ${publicBundleIdentifier}.`
  );
}

if (bundleIdentifier) {
  if (!/^[A-Za-z0-9.-]+$/.test(bundleIdentifier)) {
    errors.push(`IOS_BUNDLE_IDENTIFIER contains invalid characters. Received: ${bundleIdentifier}`);
  }

  if (profile === "beta" && !bundleIdentifier.endsWith(".beta")) {
    errors.push(`Beta builds should use a .beta bundle identifier. Received: ${bundleIdentifier}`);
  }

  if (
    profile === "production" &&
    (bundleIdentifier.endsWith(".internal") || bundleIdentifier.endsWith(".beta"))
  ) {
    errors.push(
      `Production builds must not use an internal or beta bundle identifier. Received: ${bundleIdentifier}`
    );
  }
}

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
if (apiBaseUrl) {
  let parsedApiBaseUrl;

  try {
    parsedApiBaseUrl = new URL(apiBaseUrl);
  } catch {
    errors.push(`EXPO_PUBLIC_API_BASE_URL must be a valid URL. Received: ${apiBaseUrl}`);
  }

  if (parsedApiBaseUrl) {
    const hostname = parsedApiBaseUrl.hostname.toLowerCase();
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local");

    if (!parsedApiBaseUrl.pathname.endsWith("/v1")) {
      warnings.push(
        `EXPO_PUBLIC_API_BASE_URL does not end with /v1. Current value: ${parsedApiBaseUrl.toString()}`
      );
    }

    if ((profile === "beta" || profile === "production") && parsedApiBaseUrl.protocol !== "https:") {
      errors.push(`${profile} builds must use an https API base URL. Received: ${apiBaseUrl}`);
    }

    if ((profile === "beta" || profile === "production") && isLocalHost) {
      errors.push(`${profile} builds cannot point to localhost. Received: ${apiBaseUrl}`);
    }

    if ((profile === "beta" || profile === "production") && hostname === "example.com") {
      errors.push(`${profile} builds cannot use placeholder example.com URLs. Received: ${apiBaseUrl}`);
    }

    if (profile === "beta" && hostname !== "api-dev.nomly.us") {
      errors.push(`Beta builds must use api-dev.nomly.us. Received: ${hostname}`);
    }

    if (profile === "production" && hostname !== "api.nomly.us") {
      errors.push(`Production builds must use api.nomly.us. Received: ${hostname}`);
    }
  }
}

const merchantIdentifier = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID?.trim() ?? "";
if (merchantIdentifier) {
  if (!merchantIdentifier.startsWith("merchant.")) {
    errors.push(
      `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID must start with merchant. Received: ${merchantIdentifier}`
    );
  }

  if (merchantIdentifier === "merchant.com.lattelink.rawaq" && profile !== "production") {
    warnings.push(
      `Non-production ${profile} build is using the production-looking Apple Pay merchant identifier: ${merchantIdentifier}`
    );
  }
}

const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() ?? "https://nomly.us/privacy-policy";
if (privacyPolicyUrl) {
  let parsedPrivacyPolicyUrl;

  try {
    parsedPrivacyPolicyUrl = new URL(privacyPolicyUrl);
  } catch {
    errors.push(`EXPO_PUBLIC_PRIVACY_POLICY_URL must be a valid URL. Received: ${privacyPolicyUrl}`);
  }

  if (parsedPrivacyPolicyUrl) {
    if ((profile === "beta" || profile === "production") && parsedPrivacyPolicyUrl.protocol !== "https:") {
      errors.push(`${profile} builds must use an https privacy policy URL. Received: ${privacyPolicyUrl}`);
    }

    if (parsedPrivacyPolicyUrl.hostname.toLowerCase() === "example.com") {
      errors.push(`EXPO_PUBLIC_PRIVACY_POLICY_URL cannot use placeholder example.com. Received: ${privacyPolicyUrl}`);
    }
  }
}

const associatedDomains = (process.env.IOS_ASSOCIATED_DOMAINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

if ((profile === "beta" || profile === "production") && associatedDomains.length === 0) {
  warnings.push(
    `${profile} builds do not define IOS_ASSOCIATED_DOMAINS. Add them before enabling universal links or credential handoff.`
  );
}

const title = `[mobile release check] ${profile}`;
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
console.log("- PASS: required environment variables are present and profile-safe.");
for (const warning of warnings) {
  console.log(`- WARN: ${warning}`);
}
