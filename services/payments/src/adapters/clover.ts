import { randomUUID } from "node:crypto";
import type { Order } from "@lattelink/contracts-orders";
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
      const tokenizeBodyForLogs = sanitizeCloverResponseBodyForLogs(tokenizeBody);
      if (!tokenizeResponse.ok) {
        this.logger.error(
          {
            orderId: request.orderId,
            internalPaymentId,
            tokenizeStatus: tokenizeResponse.status,
            tokenizeSummary,
            tokenizeBody: tokenizeBodyForLogs
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
            tokenizeSummary,
            tokenizeBody: tokenizeBodyForLogs
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

    if (!request.order) {
      throw new Error("Clover live charge requests must include the full order payload");
    }
    if (request.order.id !== request.orderId) {
      throw new Error("Clover live charge request order payload does not match the requested orderId");
    }
    if (
      request.order.total.amountCents !== request.amountCents ||
      request.order.total.currency !== request.currency
    ) {
      throw new Error("Clover live charge request order total does not match the payment amount");
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

    const cloverOrderId = await this.createCloverOrder({
      order: request.order,
      bearerToken
    });

    const paidOrder = await this.payForCloverOrder({
      request,
      bearerToken,
      cloverOrderId,
      sourceToken,
      internalPaymentId
    });

    if (paidOrder.response.status === "SUCCEEDED") {
      await this.triggerPrintEvent({
        orderId: request.order.id,
        cloverOrderId,
        bearerToken
      });
    } else {
      await this.deleteCloverOrder({ cloverOrderId, bearerToken });
    }

    return paidOrder;
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
      const cloverOrderId = await this.createCloverOrder({
        order,
        bearerToken
      });
      await this.triggerPrintEvent({
        orderId: order.id,
        cloverOrderId,
        bearerToken
      });
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

  private async createCloverOrder(params: { order: Order; bearerToken: string }): Promise<string> {
    const baseUrl = resolveCloverApiBaseUrl(this.oauthConfig.environment);
    const orderTypeId = trimToUndefined(process.env.CLOVER_ORDER_TYPE_ID);
    const createOrderBody: Record<string, unknown> = {
      taxRemoved: false,
      currency: "USD",
      total: params.order.total.amountCents,
      state: "Open",
      groupLineItems: false,
      manualTransaction: false,
      testMode: false,
      note: `LatteLink order ${params.order.id}`
    };
    if (orderTypeId) {
      createOrderBody.orderType = { id: orderTypeId };
    }

    this.logger.info(
      {
        orderId: params.order.id,
        merchantId: this.credentials.merchantId,
        createOrderRequest: sanitizeCloverResponseBodyForLogs(createOrderBody)
      },
      "Submitting Clover order create request"
    );

    const createdOrder = await this.postClover({
      url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders`,
      bearerToken: params.bearerToken,
      body: createOrderBody
    });
    const cloverOrderId = firstStringAtPaths(createdOrder, [["id"], ["orderId"], ["order", "id"], ["data", "id"]]);
    if (!cloverOrderId) {
      throw new Error("Clover order creation did not return an order id");
    }

    this.logger.info(
      {
        orderId: params.order.id,
        merchantId: this.credentials.merchantId,
        cloverOrderId,
        createOrderRequest: sanitizeCloverResponseBodyForLogs(createOrderBody),
        createdOrderSummary: summarizeCloverOrderForLogs(createdOrder),
        createdOrderResponse: sanitizeCloverResponseBodyForLogs(createdOrder)
      },
      "Clover order create response received"
    );

    for (const item of params.order.items) {
      const quantity = Math.max(1, Math.floor(item.quantity));
      const lineItemNote = buildCloverLineItemNote(item);
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
            orderId: params.order.id,
            merchantId: this.credentials.merchantId,
            groupId: selection.groupId,
            optionId: selection.optionId,
            optionLabel: selection.optionLabel
          },
          "Clover modifier mapping missing; preserving customization in line-item note"
        );
      }

      for (let count = 0; count < quantity; count += 1) {
        const lineItemRequestBody = {
          name: item.itemName ?? item.itemId,
          alternateName: trimToUndefined(item.itemId),
          price: item.unitPriceCents,
          ...(lineItemNote ? { note: lineItemNote } : {}),
          taxRates: []
        };
        this.logger.info(
          {
            orderId: params.order.id,
            merchantId: this.credentials.merchantId,
            cloverOrderId,
            lineItemIndex: count + 1,
            lineItemQuantity: quantity,
            lineItemRequest: sanitizeCloverResponseBodyForLogs(lineItemRequestBody)
          },
          "Submitting Clover line item create request"
        );
        const lineItemResponse = await this.postClover({
          url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders/${encodeURIComponent(cloverOrderId)}/line_items`,
          bearerToken: params.bearerToken,
          body: lineItemRequestBody
        });
        const lineItemId = firstStringAtPaths(lineItemResponse, [["id"], ["lineItemId"], ["lineItem", "id"], ["data", "id"]]);
        if (!lineItemId) {
          throw new Error(`Clover line item creation did not return a line item id for order ${params.order.id}`);
        }

        this.logger.info(
          {
            orderId: params.order.id,
            merchantId: this.credentials.merchantId,
            cloverOrderId,
            lineItemId,
            lineItemIndex: count + 1,
            lineItemRequest: sanitizeCloverResponseBodyForLogs(lineItemRequestBody),
            lineItemResponseSummary: summarizeCloverLineItemForLogs(lineItemResponse),
            lineItemResponse: sanitizeCloverResponseBodyForLogs(lineItemResponse)
          },
          "Clover line item create response received"
        );

        for (const entry of mappedModifierIds) {
          await this.postClover({
            url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders/${encodeURIComponent(cloverOrderId)}/line_items/${encodeURIComponent(lineItemId)}/modifications`,
            bearerToken: params.bearerToken,
            body: {
              modifier: {
                id: entry.modifierId
              }
            }
          });
        }
      }
    }

    return cloverOrderId;
  }

  private async payForCloverOrder(params: {
    request: ChargeRequest;
    bearerToken: string;
    cloverOrderId: string;
    sourceToken: string;
    internalPaymentId: string;
  }): Promise<{ response: ChargeResponse; providerPaymentId?: string }> {
    const payUrl = `${resolveCloverEcommerceBaseUrl(this.oauthConfig.environment)}/v1/orders/${encodeURIComponent(params.cloverOrderId)}/pay`;
    const payRequestBody = {
      amount: params.request.amountCents,
      currency: params.request.currency.toLowerCase(),
      source: params.sourceToken,
      ecomind: "ecom",
      external_customer_reference: params.request.orderId,
      metadata: {
        orderId: params.request.orderId,
        internalPaymentId: params.internalPaymentId,
        idempotencyKey: params.request.idempotencyKey,
        origin: "gazelle-payments-service",
        cloverOrderId: params.cloverOrderId
      }
    };
    const payHeaders: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${params.bearerToken}`,
      "x-request-id": this.requestId,
      "idempotency-key": params.request.idempotencyKey,
      "user-agent": `GazellePayments/${process.env.npm_package_version ?? "0.1.0"} (${this.oauthConfig.environment})`
    };
    const forwardedFor = trimToUndefined(process.env.CLOVER_X_FORWARDED_FOR);
    if (forwardedFor) {
      payHeaders["x-forwarded-for"] = forwardedFor;
    }

    let payResponse: Response;
    const payController = new AbortController();
    const payTimeout = setTimeout(() => payController.abort(), 10_000);
    try {
      this.logger.info(
        {
          orderId: params.request.orderId,
          merchantId: this.credentials.merchantId,
          cloverOrderId: params.cloverOrderId,
          payOrderRequest: sanitizeCloverResponseBodyForLogs(payRequestBody)
        },
        "Submitting Clover order payment request"
      );
      payResponse = await fetch(payUrl, {
        method: "POST",
        headers: payHeaders,
        body: JSON.stringify(payRequestBody),
        signal: payController.signal
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          requestId: this.requestId,
          orderId: params.request.orderId,
          cloverOrderId: params.cloverOrderId,
          internalPaymentId: params.internalPaymentId
        },
        "Clover order payment request failed before response"
      );
      return {
        response: {
          paymentId: randomUUID(),
          provider: "CLOVER",
          orderId: params.request.orderId,
          status: "TIMEOUT",
          approved: false,
          amountCents: params.request.amountCents,
          currency: params.request.currency,
          occurredAt: new Date().toISOString(),
          message: "Clover network request failed"
        }
      };
    } finally {
      clearTimeout(payTimeout);
    }

    const body = parseJsonSafely(await payResponse.text());
    this.logger.info(
      {
        orderId: params.request.orderId,
        merchantId: this.credentials.merchantId,
        cloverOrderId: params.cloverOrderId,
        payOrderRequest: sanitizeCloverResponseBodyForLogs(payRequestBody),
        payOrderResponseSummary: summarizeCloverResponseForLogs(body),
        payOrderResponse: sanitizeCloverResponseBodyForLogs(body)
      },
      "Clover order payment response received"
    );
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
      ]) ?? `Clover responded with status ${payResponse.status}`;
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
      httpStatus: payResponse.status
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
        paymentId: params.internalPaymentId,
        provider: "CLOVER",
        orderId: params.request.orderId,
        status,
        approved: status === "SUCCEEDED",
        amountCents: params.request.amountCents,
        currency: params.request.currency,
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
      providerPaymentId: providerPaymentId ?? params.internalPaymentId
    };
  }

  private async deleteCloverOrder(params: { cloverOrderId: string; bearerToken: string }): Promise<void> {
    const baseUrl = resolveCloverApiBaseUrl(this.oauthConfig.environment);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(
        `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/orders/${encodeURIComponent(params.cloverOrderId)}`,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${params.bearerToken}`,
            "x-request-id": this.requestId
          },
          signal: controller.signal
        }
      );
      if (!response.ok) {
        this.logger.warn(
          { cloverOrderId: params.cloverOrderId, merchantId: this.credentials.merchantId, status: response.status },
          "Clover order delete failed after payment failure"
        );
      } else {
        this.logger.info(
          { cloverOrderId: params.cloverOrderId, merchantId: this.credentials.merchantId },
          "Clover order deleted after payment failure"
        );
      }
    } catch (error) {
      this.logger.warn(
        { error, cloverOrderId: params.cloverOrderId, merchantId: this.credentials.merchantId },
        "Clover order delete request failed after payment failure"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async triggerPrintEvent(params: { orderId: string; cloverOrderId: string; bearerToken: string }) {
    const baseUrl = resolveCloverApiBaseUrl(this.oauthConfig.environment);
    try {
      await this.postClover({
        url: `${baseUrl}/v3/merchants/${encodeURIComponent(this.credentials.merchantId)}/print_event`,
        bearerToken: params.bearerToken,
        body: {
          orderRef: {
            id: params.cloverOrderId
          }
        }
      });
    } catch (error) {
      this.logger.warn(
        {
          error,
          orderId: params.orderId,
          cloverOrderId: params.cloverOrderId,
          merchantId: this.credentials.merchantId
        },
        "Clover print event failed after order submission; leaving created order in place"
      );
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

function resolveCloverApiBaseUrl(environment: CloverOAuthConfig["environment"]) {
  return environment === "production" ? "https://api.clover.com" : "https://apisandbox.dev.clover.com";
}

function resolveCloverEcommerceBaseUrl(environment: CloverOAuthConfig["environment"]) {
  return environment === "production" ? "https://scl.clover.com" : "https://scl-sandbox.dev.clover.com";
}

function buildCloverLineItemNote(item: Order["items"][number]) {
  const lines = (item.customization?.selectedOptions ?? []).map((selection) => `${selection.groupLabel}: ${selection.optionLabel}`);
  const freeformNotes = trimToUndefined(item.customization?.notes);
  if (freeformNotes) {
    lines.push(`Notes: ${freeformNotes}`);
  }

  return lines.join("\n");
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

function firstNumberAtPaths(value: unknown, paths: string[][]): number | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
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

type CloverLogSummaryValue = string | number | boolean;

function buildCloverLogSummary(
  summary: Record<string, CloverLogSummaryValue | undefined>
): Record<string, CloverLogSummaryValue> {
  return Object.fromEntries(
    Object.entries(summary).filter((entry): entry is [string, CloverLogSummaryValue] => entry[1] !== undefined)
  );
}

function summarizeCloverOrderForLogs(value: unknown): Record<string, string | number | boolean> {
  const summary = {
    id: firstStringAtPaths(value, [["id"], ["orderId"], ["order", "id"], ["data", "id"]]),
    title: firstStringAtPaths(value, [["title"], ["data", "title"]]),
    state: firstStringAtPaths(value, [["state"], ["data", "state"]]),
    paymentState: firstStringAtPaths(value, [["paymentState"], ["data", "paymentState"]]),
    total: firstNumberAtPaths(value, [["total"], ["data", "total"]]),
    groupLineItems: firstBooleanAtPaths(value, [["groupLineItems"], ["data", "groupLineItems"]]),
    manualTransaction: firstBooleanAtPaths(value, [["manualTransaction"], ["data", "manualTransaction"]]),
    note: firstStringAtPaths(value, [["note"], ["data", "note"]]),
    createdTime: firstNumberAtPaths(value, [["createdTime"], ["data", "createdTime"]]),
    modifiedTime: firstNumberAtPaths(value, [["modifiedTime"], ["data", "modifiedTime"]])
  };
  return buildCloverLogSummary(summary);
}

function summarizeCloverLineItemForLogs(value: unknown): Record<string, string | number | boolean> {
  const summary = {
    id: firstStringAtPaths(value, [["id"], ["lineItemId"], ["lineItem", "id"], ["data", "id"]]),
    name: firstStringAtPaths(value, [["name"], ["lineItem", "name"], ["data", "name"]]),
    alternateName: firstStringAtPaths(value, [["alternateName"], ["lineItem", "alternateName"], ["data", "alternateName"]]),
    note: firstStringAtPaths(value, [["note"], ["lineItem", "note"], ["data", "note"]]),
    price: firstNumberAtPaths(value, [["price"], ["lineItem", "price"], ["data", "price"]]),
    unitQty: firstNumberAtPaths(value, [["unitQty"], ["lineItem", "unitQty"], ["data", "unitQty"]]),
    printed: firstBooleanAtPaths(value, [["printed"], ["lineItem", "printed"], ["data", "printed"]]),
    exchanged: firstBooleanAtPaths(value, [["exchanged"], ["lineItem", "exchanged"], ["data", "exchanged"]])
  };
  return buildCloverLogSummary(summary);
}

const cloverSensitiveLogKeys = new Set([
  "access_token",
  "refresh_token",
  "token",
  "source",
  "sourcetoken",
  "apikey",
  "apiaccesskey",
  "authorization",
  "bearer"
]);

function sanitizeCloverResponseBodyForLogs(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }

  if (depth >= 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => sanitizeCloverResponseBodyForLogs(entry, depth + 1));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 25)
      .map(([key, entryValue]) => [
        key,
        cloverSensitiveLogKeys.has(key.toLowerCase())
          ? "[redacted]"
          : sanitizeCloverResponseBodyForLogs(entryValue, depth + 1)
      ])
  );
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
  const parsed =
    upstream.ok
      ? cloverOauthTokenResponseSchema.parse(parsedBody)
      : await recoverCloverTokenPair({
          oauthConfig,
          connection,
          refreshResponse: upstream,
          refreshResponseBody: parsedBody
        });
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

async function recoverCloverTokenPair(params: {
  oauthConfig: CloverOAuthConfig;
  connection: CloverConnection;
  refreshResponse: Response;
  refreshResponseBody: unknown;
}) {
  if (
    params.refreshResponse.status !== 401 ||
    params.refreshResponse.headers.get("x-clover-recovery-available") !== "true" ||
    !params.oauthConfig.appSecret
  ) {
    throw new Error(
      firstStringAtPaths(params.refreshResponseBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth refresh failed with status ${params.refreshResponse.status}`
    );
  }

  const recoveryController = new AbortController();
  const recoveryTimeout = setTimeout(() => recoveryController.abort(), 10_000);
  let recoveryResponse: Response;
  try {
    recoveryResponse = await fetch(params.oauthConfig.recoveryEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        client_id: params.oauthConfig.appId,
        client_secret: params.oauthConfig.appSecret,
        recovery_token: params.connection.refreshToken
      }),
      signal: recoveryController.signal
    });
  } finally {
    clearTimeout(recoveryTimeout);
  }

  const recoveryBody = parseJsonSafely(await recoveryResponse.text());
  if (!recoveryResponse.ok) {
    throw new Error(
      firstStringAtPaths(recoveryBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth recovery failed with status ${recoveryResponse.status}`
    );
  }

  return cloverOauthTokenResponseSchema.parse(recoveryBody);
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
