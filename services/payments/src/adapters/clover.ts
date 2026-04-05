import { randomUUID } from "node:crypto";
import type { Order } from "@gazelle/contracts-orders";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type {
  ChargeRequest,
  ChargeResponse,
  CloverConnection,
  CloverOAuthConfig,
  CloverProviderConfig,
  CloverRuntimeCredentials,
  PaymentsRepository,
  RefundRequest,
  RefundResponse
} from "../routes.js";
import type { PosAdapter } from "./types.js";

const cloverOauthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1).optional(),
  scope: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  expires_in: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  refresh_token_expires_in: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  access_token_expiration: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  refresh_token_expiration: z.union([z.number().int().positive(), z.string().min(1)]).optional()
});

type CloverAdapterParams = {
  config: CloverProviderConfig;
  credentials: CloverRuntimeCredentials;
  requestId: string;
  logger: FastifyBaseLogger;
  repository: PaymentsRepository;
  oauthConfig: CloverOAuthConfig;
};

class CloverOrderSubmissionError extends Error {
  readonly merchantId?: string;

  constructor(message: string, merchantId?: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "CloverOrderSubmissionError";
    this.merchantId = merchantId;
  }
}

export function isCloverOrderSubmissionError(error: unknown): error is CloverOrderSubmissionError {
  return error instanceof CloverOrderSubmissionError;
}

export class CloverAdapter implements PosAdapter {
  private readonly config: CloverProviderConfig;

  private readonly credentials: CloverRuntimeCredentials;

  private readonly requestId: string;

  private readonly logger: FastifyBaseLogger;

  private readonly repository: PaymentsRepository;

  private readonly oauthConfig: CloverOAuthConfig;

  constructor(params: CloverAdapterParams) {
    this.config = params.config;
    this.credentials = params.credentials;
    this.requestId = params.requestId;
    this.logger = params.logger;
    this.repository = params.repository;
    this.oauthConfig = params.oauthConfig;
  }

  async processCharge(request: ChargeRequest): Promise<{ response: ChargeResponse; providerPaymentId?: string }> {
    if (!this.config.chargeEndpoint) {
      throw new Error(this.config.misconfigurationReason ?? "Clover provider is not configured");
    }

    const internalPaymentId = randomUUID();
    let sourceToken = request.paymentSourceToken ?? request.applePayToken;
    if (!sourceToken && request.applePayWallet) {
      if (!this.config.applePayTokenizeEndpoint) {
        throw new Error("Clover wallet tokenization endpoint is not configured");
      }
      if (!this.credentials.apiAccessKey) {
        throw new Error("Clover merchant API access key is not configured. Complete the Clover OAuth connection flow.");
      }

      const tokenizeController = new AbortController();
      const tokenizeTimeout = setTimeout(() => tokenizeController.abort(), 10_000);
      let tokenizeResponse: Response;
      try {
        tokenizeResponse = await fetch(
          toTemplatedUrl(this.config.applePayTokenizeEndpoint, { merchantId: this.credentials.merchantId }),
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              apikey: this.credentials.apiAccessKey,
              "x-request-id": this.requestId
            },
            body: JSON.stringify({
              encryptedWallet: {
                applePayPaymentData: request.applePayWallet
              }
            }),
            signal: tokenizeController.signal
          }
        );
      } finally {
        clearTimeout(tokenizeTimeout);
      }

      const tokenizeBody = parseJsonSafely(await tokenizeResponse.text());
      const tokenizeSummary = summarizeCloverResponseForLogs(tokenizeBody);
      if (!tokenizeResponse.ok) {
        this.logger.error(
          {
            orderId: request.orderId,
            internalPaymentId,
            tokenizeStatus: tokenizeResponse.status,
            tokenizeSummary
          },
          "Clover Apple Pay wallet tokenization failed"
        );
        throw new Error(`Clover wallet tokenization failed with status ${tokenizeResponse.status}`);
      }

      sourceToken = firstStringAtPaths(tokenizeBody, [
        ["id"],
        ["token"],
        ["source"],
        ["sourceToken"],
        ["result", "id"],
        ["result", "token"],
        ["data", "id"],
        ["data", "token"]
      ]);

      if (!sourceToken) {
        this.logger.error(
          {
            orderId: request.orderId,
            internalPaymentId,
            tokenizeStatus: tokenizeResponse.status,
            tokenizeSummary
          },
          "Clover Apple Pay wallet tokenization failed"
        );
        throw new Error("Clover wallet tokenization did not return a source token");
      }

      this.logger.info(
        {
          orderId: request.orderId,
          internalPaymentId,
          tokenizeStatus: tokenizeResponse.status,
          tokenizeSummary
        },
        "Clover Apple Pay wallet tokenization succeeded"
      );
    }

    if (!sourceToken) {
      throw new Error("Unable to resolve Clover payment source token");
    }

    let bearerToken = this.credentials.bearerToken;
    if (this.credentials.source === "oauth") {
      try {
        const connection = await this.repository.findCloverConnection(this.credentials.merchantId);
        if (connection) {
          bearerToken = await ensureFreshCloverToken({
            logger: this.logger,
            repository: this.repository,
            oauthConfig: this.oauthConfig,
            connection
          });
        }
      } catch (error) {
        this.logger.warn(
          {
            error,
            orderId: request.orderId,
            internalPaymentId,
            merchantId: this.credentials.merchantId
          },
          "Token refresh attempted but failed; proceeding with existing token"
        );
      }
    }

    const chargeUrl = toTemplatedUrl(this.config.chargeEndpoint, { merchantId: this.credentials.merchantId });
    let chargeResponse: Response;
    const chargeController = new AbortController();
    const chargeTimeout = setTimeout(() => chargeController.abort(), 10_000);
    try {
      chargeResponse = await fetch(chargeUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
          "x-request-id": this.requestId,
          "idempotency-key": request.idempotencyKey
        },
        body: JSON.stringify({
          merchantId: this.credentials.merchantId,
          amount: request.amountCents,
          amountCents: request.amountCents,
          currency: request.currency,
          currencyCode: request.currency,
          source: sourceToken,
          sourceToken,
          externalReference: request.orderId,
          metadata: {
            orderId: request.orderId,
            internalPaymentId,
            idempotencyKey: request.idempotencyKey,
            origin: "gazelle-payments-service"
          }
        }),
        signal: chargeController.signal
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          requestId: this.requestId,
          orderId: request.orderId,
          internalPaymentId
        },
        "Clover charge request failed before response"
      );
      return {
        response: {
          paymentId: randomUUID(),
          provider: "CLOVER",
          orderId: request.orderId,
          status: "TIMEOUT",
          approved: false,
          amountCents: request.amountCents,
          currency: request.currency,
          occurredAt: new Date().toISOString(),
          message: "Clover network request failed"
        }
      };
    } finally {
      clearTimeout(chargeTimeout);
    }

    const body = parseJsonSafely(await chargeResponse.text());
    const providerStatus = firstStringAtPaths(body, [
      ["status"],
      ["charge", "status"],
      ["payment", "status"],
      ["result", "status"],
      ["data", "status"]
    ]);
    const providerMessage =
      firstStringAtPaths(body, [
        ["message"],
        ["description"],
        ["reason"],
        ["error"],
        ["result", "message"],
        ["data", "message"]
      ]) ?? `Clover responded with status ${chargeResponse.status}`;
    const approved = firstBooleanAtPaths(body, [
      ["approved"],
      ["charge", "approved"],
      ["payment", "approved"],
      ["result", "approved"],
      ["data", "approved"]
    ]);
    const status = resolveChargeStatus({
      providerStatus,
      approved,
      httpStatus: chargeResponse.status
    });
    const providerPaymentId = firstStringAtPaths(body, [
      ["id"],
      ["paymentId"],
      ["payment_id"],
      ["chargeId"],
      ["charge_id"],
      ["result", "id"],
      ["data", "id"],
      ["payment", "id"],
      ["charge", "id"]
    ]);

    return {
      response: {
        paymentId: internalPaymentId,
        provider: "CLOVER",
        orderId: request.orderId,
        status,
        approved: status === "SUCCEEDED",
        amountCents: request.amountCents,
        currency: request.currency,
        occurredAt: new Date().toISOString(),
        declineCode:
          status === "DECLINED"
            ? firstStringAtPaths(body, [
                ["declineCode"],
                ["decline_code"],
                ["reasonCode"],
                ["reason_code"],
                ["errorCode"],
                ["error_code"],
                ["code"]
              ])
            : undefined,
        message: providerMessage
      },
      providerPaymentId: providerPaymentId ?? internalPaymentId
    };
  }

  async processRefund(request: RefundRequest, providerPaymentId?: string): Promise<RefundResponse> {
    if (!this.config.refundEndpoint) {
      throw new Error(this.config.misconfigurationReason ?? "Clover provider is not configured");
    }

    const providerChargeId = providerPaymentId ?? request.paymentId;
    let bearerToken = this.credentials.bearerToken;
    if (this.credentials.source === "oauth") {
      try {
        const connection = await this.repository.findCloverConnection(this.credentials.merchantId);
        if (connection) {
          bearerToken = await ensureFreshCloverToken({
            logger: this.logger,
            repository: this.repository,
            oauthConfig: this.oauthConfig,
            connection
          });
        }
      } catch (error) {
        this.logger.warn(
          {
            error,
            orderId: request.orderId,
            merchantId: this.credentials.merchantId
          },
          "Token refresh attempted but failed; proceeding with existing token"
        );
      }
    }

    const refundUrl = toTemplatedUrl(this.config.refundEndpoint, {
      merchantId: this.credentials.merchantId,
      paymentId: providerChargeId
    });
    const refundController = new AbortController();
    const refundTimeout = setTimeout(() => refundController.abort(), 10_000);
    let upstream: Response;
    try {
      upstream = await fetch(refundUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
          "x-request-id": this.requestId,
          "idempotency-key": request.idempotencyKey
        },
        body: JSON.stringify({
          charge: providerChargeId
        }),
        signal: refundController.signal
      });
    } finally {
      clearTimeout(refundTimeout);
    }

    const body = parseJsonSafely(await upstream.text());
    const providerStatus = firstStringAtPaths(body, [
      ["status"],
      ["refund", "status"],
      ["result", "status"],
      ["data", "status"]
    ]);
    const status = resolveRefundStatus({
      providerStatus,
      httpStatus: upstream.status
    });

    return {
      refundId: randomUUID(),
      provider: "CLOVER",
      orderId: request.orderId,
      paymentId: request.paymentId,
      status,
      amountCents: request.amountCents,
      currency: request.currency,
      occurredAt: new Date().toISOString(),
      message:
        firstStringAtPaths(body, [
          ["message"],
          ["description"],
          ["reason"],
          ["error"],
          ["result", "message"],
          ["data", "message"]
        ]) ?? `Clover responded with status ${upstream.status}`
    };
  }

  async submitOrder(order: Order): Promise<void> {
    try {
      const bearerToken = await this.resolveBearerToken(order.id);
      const baseUrl =
        this.oauthConfig.environment === "production"
          ? "https://api.clover.com"
          : "https://apisandbox.dev.clover.com";
      const orderTypeId = trimToUndefined(process.env.CLOVER_ORDER_TYPE_ID);
      const createOrderBody: Record<string, unknown> = {
        taxRemoved: false,
        currency: "USD",
        total: order.total.amountCents,
        state: "Open",
        groupLineItems: true,
        manualTransaction: false,
        testMode: false,
        note: `LatteLink order ${order.id}`
      };
      if (orderTypeId) {
        createOrderBody.orderType = { id: orderTypeId };
      }

      const createdOrder = await this.postClover({
        url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders`,
        bearerToken,
        body: createOrderBody
      });
      const cloverOrderId = firstStringAtPaths(createdOrder, [["id"], ["orderId"], ["order", "id"], ["data", "id"]]);
      if (!cloverOrderId) {
        throw new Error("Clover order creation did not return an order id");
      }

      for (const item of order.items) {
        const quantity = Math.max(1, Math.floor(item.quantity));
        const customizationEntries = (item.customization?.selectedOptions ?? []).map(
          (selection) => `${selection.groupLabel}: ${selection.optionLabel}`
        );
        const itemNotes = [
          customizationEntries.length > 0 ? customizationEntries.join("; ") : undefined,
          trimToUndefined(item.customization?.notes) ? `notes: ${item.customization?.notes}` : undefined
        ].filter((value): value is string => Boolean(value));
        const lineItemNote = itemNotes.join("; ");
        const mappedModifierIds = (item.customization?.selectedOptions ?? [])
          .map((selection) => ({
            selection,
            modifierId: resolveCloverModifierId(selection.optionId)
          }))
          .filter((entry) => Boolean(entry.modifierId));
        const unmappedSelections = (item.customization?.selectedOptions ?? []).filter(
          (selection) => !resolveCloverModifierId(selection.optionId)
        );
        for (const selection of unmappedSelections) {
          this.logger.info(
            {
              orderId: order.id,
              merchantId: this.credentials.merchantId,
              groupId: selection.groupId,
              optionId: selection.optionId,
              optionLabel: selection.optionLabel
            },
            "Clover modifier mapping missing; preserving customization in line-item note"
          );
        }

        for (let count = 0; count < quantity; count += 1) {
          const lineItemResponse = await this.postClover({
            url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders/${encodeURIComponent(cloverOrderId)}/line_items`,
            bearerToken,
            body: {
              name: item.itemName ?? item.itemId,
              alternateName: trimToUndefined(item.itemId),
              price: item.unitPriceCents,
              note: lineItemNote,
              taxRates: []
            }
          });
          const lineItemId = firstStringAtPaths(lineItemResponse, [["id"], ["lineItemId"], ["lineItem", "id"], ["data", "id"]]);
          if (!lineItemId) {
            throw new Error(`Clover line item creation did not return a line item id for order ${order.id}`);
          }

          for (const entry of mappedModifierIds) {
            await this.postClover({
              url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders/${encodeURIComponent(cloverOrderId)}/line_items/${encodeURIComponent(lineItemId)}/modifications`,
              bearerToken,
              body: {
                modifier: {
                  id: entry.modifierId
                }
              }
            });
          }
        }
      }

      try {
        await this.postClover({
          url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/print_event`,
          bearerToken,
          body: {
            orderRef: {
              id: cloverOrderId
            }
          }
        });
      } catch (error) {
        this.logger.warn(
          {
            error,
            orderId: order.id,
            cloverOrderId,
            merchantId: this.credentials.merchantId
          },
          "Clover print event failed after order submission; leaving created order in place"
        );
      }
    } catch (error) {
      throw new CloverOrderSubmissionError(
        error instanceof Error ? error.message : "Clover order submission failed",
        this.credentials.merchantId,
        error
      );
    }
  }

  private async resolveBearerToken(orderId: string): Promise<string> {
    if (this.credentials.source !== "oauth") {
      return this.credentials.bearerToken;
    }

    try {
      const connection = await this.repository.findCloverConnection(this.credentials.merchantId);
      if (!connection) {
        return this.credentials.bearerToken;
      }
      return await ensureFreshCloverToken({
        logger: this.logger,
        repository: this.repository,
        oauthConfig: this.oauthConfig,
        connection
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          orderId,
          merchantId: this.credentials.merchantId
        },
        "Token refresh attempted but failed; proceeding with existing token"
      );
      return this.credentials.bearerToken;
    }
  }

  private async postClover(params: {
    url: string;
    bearerToken: string;
    body: Record<string, unknown>;
  }): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let upstream: Response;
    try {
      upstream = await fetch(params.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${params.bearerToken}`,
          "content-type": "application/json",
          accept: "application/json",
          "x-request-id": this.requestId,
          "user-agent": `GazellePayments/${process.env.npm_package_version ?? "0.1.0"} (${this.oauthConfig.environment})`
        },
        body: JSON.stringify(params.body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = parseJsonSafely(await upstream.text());
    if (!upstream.ok) {
      const message =
        firstStringAtPaths(body, [["message"], ["error_description"], ["error"], ["result", "message"], ["data", "message"]]) ??
        `Clover request failed with status ${upstream.status}`;
      throw new Error(message);
    }
    return body;
  }
}

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonSafely(raw: string): unknown {
  if (!raw || raw.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function readPath(value: unknown, path: string[]): unknown {
  let cursor: unknown = value;
  for (const part of path) {
    if (!isRecord(cursor) || !(part in cursor)) {
      return undefined;
    }
    cursor = cursor[part];
  }

  return cursor;
}

function firstStringAtPaths(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function firstBooleanAtPaths(value: unknown, paths: string[][]): boolean | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return undefined;
}

function summarizeCloverResponseForLogs(value: unknown): Record<string, string> {
  const summary = {
    status: firstStringAtPaths(value, [
      ["status"],
      ["result", "status"],
      ["data", "status"],
      ["payment", "status"],
      ["charge", "status"],
      ["refund", "status"]
    ]),
    code: firstStringAtPaths(value, [
      ["code"],
      ["errorCode"],
      ["error_code"],
      ["reasonCode"],
      ["reason_code"],
      ["result", "code"],
      ["data", "code"]
    ]),
    message: firstStringAtPaths(value, [
      ["message"],
      ["description"],
      ["reason"],
      ["error"],
      ["result", "message"],
      ["data", "message"]
    ])
  };

  const entries = Object.entries(summary).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return Object.fromEntries(entries);
}

function toTemplatedUrl(template: string, variables: Record<string, string>) {
  let resolved = template;
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(value));
  }

  return resolved;
}

function resolveChargeStatus(params: {
  providerStatus?: string;
  approved?: boolean;
  httpStatus: number;
}): ChargeResponse["status"] {
  const providerStatus = params.providerStatus?.toLowerCase();
  if (providerStatus) {
    if (
      providerStatus.includes("timeout") ||
      providerStatus.includes("timed_out") ||
      providerStatus.includes("pending") ||
      providerStatus.includes("processing")
    ) {
      return "TIMEOUT";
    }
    if (
      providerStatus.includes("declin") ||
      providerStatus.includes("reject") ||
      providerStatus.includes("denied") ||
      providerStatus.includes("failed") ||
      providerStatus.includes("cancel")
    ) {
      return "DECLINED";
    }
    if (
      providerStatus.includes("success") ||
      providerStatus.includes("approv") ||
      providerStatus.includes("paid") ||
      providerStatus.includes("captur") ||
      providerStatus.includes("complete") ||
      providerStatus.includes("authoriz")
    ) {
      return "SUCCEEDED";
    }
  }

  if (params.approved === true) {
    return "SUCCEEDED";
  }
  if (params.httpStatus === 408 || params.httpStatus === 429 || params.httpStatus >= 500) {
    return "TIMEOUT";
  }
  if (params.httpStatus >= 400) {
    return "DECLINED";
  }

  return "SUCCEEDED";
}

function resolveRefundStatus(params: { providerStatus?: string; httpStatus: number }): RefundResponse["status"] {
  const providerStatus = params.providerStatus?.toLowerCase();
  if (providerStatus) {
    if (
      providerStatus.includes("refund") ||
      providerStatus.includes("succeed") ||
      providerStatus.includes("approv") ||
      providerStatus.includes("complete")
    ) {
      return "REFUNDED";
    }
    if (
      providerStatus.includes("reject") ||
      providerStatus.includes("declin") ||
      providerStatus.includes("deny") ||
      providerStatus.includes("fail")
    ) {
      return "REJECTED";
    }
  }

  if (params.httpStatus >= 400) {
    return "REJECTED";
  }

  return "REFUNDED";
}

function normalizeScope(scope: string | string[] | undefined) {
  if (Array.isArray(scope)) {
    return scope.join(" ");
  }

  return scope;
}

function toIsoFromSeconds(nowMs: number, expiresInValue: unknown) {
  const expiresIn =
    typeof expiresInValue === "number"
      ? expiresInValue
      : typeof expiresInValue === "string" && expiresInValue.trim().length > 0
        ? Number(expiresInValue)
        : NaN;
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    return undefined;
  }

  return new Date(nowMs + expiresIn * 1000).toISOString();
}

function toIsoFromUnixSeconds(unixSecondsValue: unknown) {
  const unixSeconds =
    typeof unixSecondsValue === "number"
      ? unixSecondsValue
      : typeof unixSecondsValue === "string" && unixSecondsValue.trim().length > 0
        ? Number(unixSecondsValue)
        : NaN;
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return undefined;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function resolveCloverTokenExpiration(params: {
  nowMs: number;
  expiresIn?: unknown;
  absoluteUnixSeconds?: unknown;
}) {
  return toIsoFromUnixSeconds(params.absoluteUnixSeconds) ?? toIsoFromSeconds(params.nowMs, params.expiresIn);
}

async function fetchCloverApiAccessKey(params: {
  oauthConfig: CloverOAuthConfig;
  accessToken: string;
}): Promise<string> {
  const pakmsController = new AbortController();
  const pakmsTimeout = setTimeout(() => pakmsController.abort(), 10_000);
  let upstream: Response;
  try {
    upstream = await fetch(params.oauthConfig.pakmsEndpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${params.accessToken}`
      },
      signal: pakmsController.signal
    });
  } finally {
    clearTimeout(pakmsTimeout);
  }
  const parsedBody = parseJsonSafely(await upstream.text());
  if (!upstream.ok) {
    throw new Error(
      firstStringAtPaths(parsedBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover apiAccessKey lookup failed with status ${upstream.status}`
    );
  }

  const apiAccessKey = firstStringAtPaths(parsedBody, [
    ["apiAccessKey"],
    ["api_access_key"],
    ["apikey"],
    ["key"],
    ["result", "apiAccessKey"],
    ["data", "apiAccessKey"]
  ]);
  if (!apiAccessKey) {
    throw new Error("Clover apiAccessKey lookup did not return an apiAccessKey");
  }

  return apiAccessKey;
}

async function refreshCloverConnection(params: {
  oauthConfig: CloverOAuthConfig;
  connection: CloverConnection;
}): Promise<CloverConnection> {
  const { oauthConfig, connection } = params;
  if (!oauthConfig.configured || !oauthConfig.appId || !oauthConfig.appSecret || !connection.refreshToken) {
    throw new Error("Clover OAuth refresh is not configured");
  }

  const body = JSON.stringify({
    client_id: oauthConfig.appId,
    refresh_token: connection.refreshToken
  });

  const tokenRefreshController = new AbortController();
  const tokenRefreshTimeout = setTimeout(() => tokenRefreshController.abort(), 10_000);
  let upstream: Response;
  try {
    upstream = await fetch(oauthConfig.refreshEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body,
      signal: tokenRefreshController.signal
    });
  } finally {
    clearTimeout(tokenRefreshTimeout);
  }
  const parsedBody = parseJsonSafely(await upstream.text());
  if (!upstream.ok) {
    throw new Error(
      firstStringAtPaths(parsedBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth refresh failed with status ${upstream.status}`
    );
  }

  const parsed = cloverOauthTokenResponseSchema.parse(parsedBody);
  const nowMs = Date.now();
  return {
    merchantId: connection.merchantId,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? connection.refreshToken,
    accessTokenExpiresAt:
      resolveCloverTokenExpiration({
        nowMs,
        expiresIn: parsed.expires_in,
        absoluteUnixSeconds: parsed.access_token_expiration
      }) ?? connection.accessTokenExpiresAt,
    refreshTokenExpiresAt:
      resolveCloverTokenExpiration({
        nowMs,
        expiresIn: parsed.refresh_token_expires_in,
        absoluteUnixSeconds: parsed.refresh_token_expiration
      }) ?? connection.refreshTokenExpiresAt,
    apiAccessKey: connection.apiAccessKey,
    tokenType: parsed.token_type ?? connection.tokenType,
    scope: normalizeScope(parsed.scope) ?? connection.scope
  };
}

async function ensureFreshCloverToken(params: {
  logger: FastifyBaseLogger;
  repository: PaymentsRepository;
  oauthConfig: CloverOAuthConfig;
  connection: CloverConnection;
}): Promise<string> {
  const { logger, repository, oauthConfig, connection } = params;

  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  const expiresAt = connection.accessTokenExpiresAt ? new Date(connection.accessTokenExpiresAt) : null;

  if (expiresAt && expiresAt < fiveMinutesFromNow) {
    if (!oauthConfig.configured || !connection.refreshToken) {
      throw new Error("Cannot refresh Clover token: OAuth not configured or refresh token missing");
    }

    try {
      const refreshedConnection = await refreshCloverConnection({
        oauthConfig,
        connection
      });

      if (!refreshedConnection.apiAccessKey && connection.apiAccessKey) {
        refreshedConnection.apiAccessKey = connection.apiAccessKey;
      } else if (!refreshedConnection.apiAccessKey) {
        refreshedConnection.apiAccessKey = await fetchCloverApiAccessKey({
          oauthConfig,
          accessToken: refreshedConnection.accessToken
        });
      }

      const savedConnection = await repository.saveCloverConnection(refreshedConnection);
      logger.info(
        { merchantId: savedConnection.merchantId },
        "Clover OAuth access token refreshed before charge/refund"
      );
      return savedConnection.accessToken;
    } catch (error) {
      logger.error(
        { error, merchantId: connection.merchantId },
        "Failed to refresh Clover OAuth access token"
      );
      throw new Error(
        `Failed to refresh Clover token before operation: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return connection.accessToken;
}

function resolveCloverModifierId(optionId: string): string | undefined {
  const normalized = optionId.trim();
  if (!normalized) {
    return undefined;
  }

  const explicitPrefixes = [
    "clover:modifier:",
    "clover-modifier:",
    "modifier:",
    "clover_modifier:"
  ];
  for (const prefix of explicitPrefixes) {
    if (normalized.startsWith(prefix)) {
      const suffix = trimToUndefined(normalized.slice(prefix.length));
      if (suffix) {
        return suffix;
      }
    }
  }

  return undefined;
}
