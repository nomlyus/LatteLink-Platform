import { NextResponse } from "next/server";

const MAX_SHORT_TEXT = 120;
const MAX_LONG_TEXT = 500;

type PilotIntroLead = {
  fullName: string;
  workEmail: string;
  shopName: string;
  locations: string;
  orderingSetup: string;
  goals: string;
  website?: string;
};

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseLead(body: unknown) {
  if (!body || typeof body !== "object") {
    return { error: "Submit the full intro request form." } as const;
  }

  const lead = body as Record<string, unknown>;
  const fullName = normalizeText(lead.fullName, MAX_SHORT_TEXT);
  const workEmail = normalizeText(lead.workEmail, MAX_SHORT_TEXT).toLowerCase();
  const shopName = normalizeText(lead.shopName, MAX_SHORT_TEXT);
  const locations = normalizeText(lead.locations, 80);
  const orderingSetup = normalizeText(lead.orderingSetup, MAX_LONG_TEXT);
  const goals = normalizeText(lead.goals, MAX_LONG_TEXT);
  const website = normalizeText(lead.website, 120);

  if (!fullName || !workEmail || !shopName || !locations || !orderingSetup || !goals) {
    return { error: "Complete every required field before sending the request." } as const;
  }

  if (!isValidEmail(workEmail)) {
    return { error: "Enter a valid work email address." } as const;
  }

  return {
    value: {
      fullName,
      workEmail,
      shopName,
      locations,
      orderingSetup,
      goals,
      website,
    } satisfies PilotIntroLead,
  } as const;
}

async function postToWebhook(lead: PilotIntroLead & { submittedAt: string; source: string }) {
  const webhookUrl = process.env.LATTELINK_CONTACT_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const webhookToken = process.env.LATTELINK_CONTACT_WEBHOOK_BEARER_TOKEN;
  if (webhookToken) {
    headers.Authorization = `Bearer ${webhookToken}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(lead),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`CONTACT_WEBHOOK_FAILED:${response.status}`);
  }

  return true;
}

async function postWithResend(lead: PilotIntroLead & { submittedAt: string; source: string }) {
  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.LATTELINK_CONTACT_EMAIL_TO;
  const emailFrom = process.env.LATTELINK_CONTACT_EMAIL_FROM;

  if (!resendKey || !emailTo || !emailFrom) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [emailTo],
      subject: `Nomly intro request: ${lead.shopName}`,
      text: [
        `Submitted: ${lead.submittedAt}`,
        `Name: ${lead.fullName}`,
        `Email: ${lead.workEmail}`,
        `Shop: ${lead.shopName}`,
        `Locations: ${lead.locations}`,
        "",
        "Current ordering setup:",
        lead.orderingSetup,
        "",
        "What they want Nomly to fix first:",
        lead.goals,
      ].join("\n"),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RESEND_DELIVERY_FAILED:${response.status}`);
  }

  return true;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseLead(body);

  if ("error" in parsed) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  if (parsed.value.website) {
    return NextResponse.json({
      ok: true,
      message:
        "Intro request received. We will reply within one business day to confirm fit and schedule the walkthrough.",
    });
  }

  const lead = {
    ...parsed.value,
    submittedAt: new Date().toISOString(),
    source: "lattelink-web",
  };

  try {
    const deliveredViaWebhook = await postToWebhook(lead);
    const deliveredViaResend = deliveredViaWebhook ? false : await postWithResend(lead);
    const deliveredViaDevLog =
      !deliveredViaWebhook &&
      !deliveredViaResend &&
      process.env.NODE_ENV !== "production";

    if (deliveredViaDevLog) {
      console.info("Nomly intro request", lead);
    }

    if (!deliveredViaWebhook && !deliveredViaResend && !deliveredViaDevLog) {
      return NextResponse.json(
        {
          message:
            "Lead capture is not configured in this environment yet. Please try again later.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Intro request received. We will reply within one business day to confirm fit and schedule the walkthrough.",
    });
  } catch (error) {
    console.error("Failed to deliver Nomly intro request", error);

    return NextResponse.json(
      {
        message:
          "We could not send your request right now. Please try again later.",
      },
      { status: 502 },
    );
  }
}
