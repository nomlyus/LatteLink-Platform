export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export type OwnerInviteEmailInput = {
  to: string;
  displayName: string;
  inviteUrl: string;
  locationId: string;
};

export type EmailProvider = {
  sendOwnerInvite(input: OwnerInviteEmailInput): Promise<void>;
};

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

export function resolveClientDashboardBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return trimToUndefined(env.CLIENT_DASHBOARD_BASE_URL);
}

class ConsoleEmailProvider implements EmailProvider {
  async sendOwnerInvite(input: OwnerInviteEmailInput) {
    console.info("[identity-email] owner invite", {
      to: input.to,
      displayName: input.displayName,
      locationId: input.locationId,
      inviteUrl: input.inviteUrl
    });
  }
}

class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async sendOwnerInvite(input: OwnerInviteEmailInput) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: "Set up your Nomly operator account",
        text: [
          `Hi ${input.displayName},`,
          "",
          "Your Nomly operator account is ready to set up.",
          `Open this link to set your password: ${input.inviteUrl}`,
          "",
          "This invite link is one-time use and expires automatically."
        ].join("\n")
      })
    });

    if (!response.ok) {
      throw new EmailDeliveryError(`Resend invite email failed with status ${response.status}`);
    }
  }
}

export function createEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const provider = trimToUndefined(env.EMAIL_PROVIDER) ?? "console";
  if (provider === "console") {
    return new ConsoleEmailProvider();
  }

  if (provider === "resend") {
    const apiKey = trimToUndefined(env.RESEND_API_KEY);
    const from = trimToUndefined(env.OWNER_INVITE_EMAIL_FROM);
    if (!apiKey || !from) {
      throw new EmailConfigurationError(
        "EMAIL_PROVIDER=resend requires RESEND_API_KEY and OWNER_INVITE_EMAIL_FROM"
      );
    }
    return new ResendEmailProvider(apiKey, from);
  }

  throw new EmailConfigurationError(`Unsupported EMAIL_PROVIDER: ${provider}`);
}
