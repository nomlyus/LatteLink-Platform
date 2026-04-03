import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient, type CloverCardEntryConfig } from "../api/client";

const cloverCardTokenResponseSchema = z.object({
  id: z.string().min(1),
  card: z
    .object({
      last4: z.string().min(1).optional(),
      brand: z.string().min(1).optional()
    })
    .optional()
});

export type CardEntryInput = {
  number: string;
  expMonth: string;
  expYear: string;
  cvv: string;
};

const cloverCardTokenErrorSchema = z
  .object({
    code: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
    message: z.string().min(1).optional()
  })
  .passthrough();

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeExpMonth(value: string) {
  return digitsOnly(value).slice(0, 2).padStart(2, "0");
}

function normalizeExpYear(value: string) {
  const digits = digitsOnly(value);
  if (digits.length === 2) {
    return `20${digits}`;
  }
  return digits;
}

function detectCardBrand(cardNumber: string) {
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(cardNumber)) {
    return "VISA";
  }
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7([01]\d{12}|20\d{12})))$/.test(cardNumber)) {
    return "MASTERCARD";
  }
  if (/^3[47]\d{13}$/.test(cardNumber)) {
    return "AMEX";
  }
  if (/^6(?:011|5\d{2})\d{12}$/.test(cardNumber)) {
    return "DISCOVER";
  }
  return undefined;
}

function resolveCardTokenizationError(status: number, responseText: string) {
  try {
    const parsed = cloverCardTokenErrorSchema.parse(JSON.parse(responseText));
    const detail = parsed.message ?? parsed.error ?? parsed.code;
    if (detail) {
      return `${detail} (${status})`;
    }
  } catch {
    // Fall back to the generic error when Clover does not return structured JSON.
  }

  return `Card tokenization failed (${status}).`;
}

export function useCloverCardEntryConfigQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["payments", "clover", "card-entry-config"],
    queryFn: () => apiClient.getCloverCardEntryConfig(),
    enabled,
    staleTime: 60_000
  });
}

export async function tokenizeCloverCard(input: CardEntryInput, configOverride?: CloverCardEntryConfig) {
  const number = digitsOnly(input.number);
  const expMonth = normalizeExpMonth(input.expMonth);
  const expYear = normalizeExpYear(input.expYear);
  const cvv = digitsOnly(input.cvv);

  if (number.length < 12) {
    throw new Error("Card number is incomplete.");
  }
  if (expMonth.length < 1 || Number(expMonth) < 1 || Number(expMonth) > 12) {
    throw new Error("Expiration month is invalid.");
  }
  if (expYear.length !== 4) {
    throw new Error("Expiration year is invalid.");
  }
  if (cvv.length < 3) {
    throw new Error("Security code is incomplete.");
  }

  const config = configOverride ?? (await apiClient.getCloverCardEntryConfig());
  if (!config.enabled || !config.apiAccessKey || !config.tokenizeEndpoint) {
    throw new Error("Card entry is not configured for this environment.");
  }

  const brand = detectCardBrand(number);
  const response = await fetch(config.tokenizeEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      apikey: config.apiAccessKey
    },
    body: JSON.stringify({
      card: {
        number,
        exp_month: expMonth,
        exp_year: expYear,
        cvv,
        ...(brand ? { brand } : {})
      }
    })
  });

  const responseText = await response.text();
  let parsedJson: unknown = undefined;
  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    parsedJson = undefined;
  }

  const parsed = cloverCardTokenResponseSchema.safeParse(parsedJson);
  if (!response.ok) {
    throw new Error(resolveCardTokenizationError(response.status, responseText));
  }
  if (!parsed.success || !parsed.data.id.startsWith("clv_")) {
    throw new Error("Card tokenization did not return a Clover source token.");
  }

  return {
    token: parsed.data.id,
    last4: parsed.data.card?.last4,
    brand: parsed.data.card?.brand
  };
}
