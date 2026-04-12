import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminMenuItemCreateSchema,
  adminMenuItemUpdateSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminStoreConfigUpdateSchema,
  internalLocationBootstrapSchema,
  internalLocationListResponseSchema,
  internalLocationParamsSchema,
  internalLocationSummarySchema,
  homeNewsCardCreateSchema,
  homeNewsCardUpdateSchema,
  homeNewsCardVisibilityUpdateSchema,
  homeNewsCardsResponseSchema,
  homeNewsCardSchema
} from "@lattelink/contracts-catalog";
import { z } from "zod";
import { createCatalogRepository } from "./repository.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const menuItemParamsSchema = z.object({
  itemId: z.string().min(1)
});
const cardParamsSchema = z.object({
  cardId: z.string().min(1)
});
const adminMenuItemUpdateWithCustomizationsSchema = adminMenuItemUpdateSchema.extend({
  customizationGroups: z.array(z.unknown()).optional()
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

const gatewayHeadersSchema = z.object({
  "x-gateway-token": z.string().optional()
});

const defaultRateLimitWindowMs = 60_000;

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sendError(
  reply: FastifyReply,
  input: {
    statusCode: number;
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  }
) {
  return reply.status(input.statusCode).send(
    serviceErrorSchema.parse({
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      details: input.details
    })
  );
}

function secretsMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function authorizeGatewayRequest(request: FastifyRequest, reply: FastifyReply, gatewayToken: string | undefined) {
  if (!gatewayToken) {
    sendError(reply, {
      statusCode: 503,
      code: "GATEWAY_ACCESS_NOT_CONFIGURED",
      message: "GATEWAY_INTERNAL_API_TOKEN must be configured before accepting gateway requests",
      requestId: request.id
    });
    return false;
  }

  const parsedHeaders = gatewayHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-gateway-token"] : undefined;
  if (providedToken && secretsMatch(gatewayToken, providedToken)) {
    return true;
  }

  sendError(reply, {
    statusCode: 401,
    code: "UNAUTHORIZED_GATEWAY_REQUEST",
    message: "Gateway token is invalid",
    requestId: request.id
  });
  return false;
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createCatalogRepository(app.log);
  const gatewayApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const rateLimitWindowMs = toPositiveInteger(process.env.CATALOG_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const gatewayReadRateLimit = {
    max: toPositiveInteger(process.env.CATALOG_RATE_LIMIT_GATEWAY_READ_MAX, 120),
    timeWindow: rateLimitWindowMs
  };
  const gatewayWriteRateLimit = {
    max: toPositiveInteger(process.env.CATALOG_RATE_LIMIT_GATEWAY_WRITE_MAX, 60),
    timeWindow: rateLimitWindowMs
  };
  const requireGatewayAccess = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return reply;
    }

    return undefined;
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "catalog" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await repository.pingDb();
      return { status: "ready", service: "catalog", persistence: repository.backend };
    } catch {
      reply.status(503);
      return { status: "unavailable", service: "catalog", error: "Database unavailable" };
    }
  });

  app.get("/v1/app-config", async () => repository.getAppConfig());
  app.get("/v1/menu", async () => repository.getMenu());
  app.get("/v1/cards", async () => homeNewsCardsResponseSchema.parse(await repository.getHomeNewsCards()));
  app.get("/v1/store/cards", async () => homeNewsCardsResponseSchema.parse(await repository.getHomeNewsCards()));

  app.get("/v1/store/config", async () => repository.getStoreConfig());

  app.get(
    "/v1/catalog/admin/menu",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async () => repository.getAdminMenu()
  );

  app.get(
    "/v1/catalog/admin/cards",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async () => repository.getAdminHomeNewsCards()
  );

  app.put(
    "/v1/catalog/admin/cards",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const input = homeNewsCardsResponseSchema.parse(request.body);
      return homeNewsCardsResponseSchema.parse(await repository.replaceAdminHomeNewsCards(input));
    }
  );

  app.post(
    "/v1/catalog/admin/cards",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const input = homeNewsCardCreateSchema.parse(request.body);
      return homeNewsCardSchema.parse(await repository.createAdminHomeNewsCard(input));
    }
  );

  app.put(
    "/v1/catalog/admin/cards/:cardId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { cardId } = cardParamsSchema.parse(request.params);
      const input = homeNewsCardUpdateSchema.parse(request.body);
      const updatedCard = await repository.updateAdminHomeNewsCard({
        cardId,
        ...input
      });

      if (!updatedCard) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "HOME_NEWS_CARD_NOT_FOUND",
            message: "Home news card not found",
            requestId: request.id,
            details: { cardId }
          })
        );
      }

      return homeNewsCardSchema.parse(updatedCard);
    }
  );

  app.patch(
    "/v1/catalog/admin/cards/:cardId/visibility",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { cardId } = cardParamsSchema.parse(request.params);
      const input = homeNewsCardVisibilityUpdateSchema.parse(request.body);
      const updatedCard = await repository.updateAdminHomeNewsCardVisibility({
        cardId,
        ...input
      });

      if (!updatedCard) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "HOME_NEWS_CARD_NOT_FOUND",
            message: "Home news card not found",
            requestId: request.id,
            details: { cardId }
          })
        );
      }

      return homeNewsCardSchema.parse(updatedCard);
    }
  );

  app.delete(
    "/v1/catalog/admin/cards/:cardId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const { cardId } = cardParamsSchema.parse(request.params);
      return adminMutationSuccessSchema.parse(await repository.deleteAdminHomeNewsCard(cardId));
    }
  );

  app.put(
    "/v1/catalog/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const parsedInput = adminMenuItemUpdateWithCustomizationsSchema.safeParse(request.body);
      if (!parsedInput.success) {
        return sendError(reply, {
          statusCode: 400,
          code: "INVALID_MENU_ITEM_UPDATE_PAYLOAD",
          message: "Menu item update payload is invalid",
          requestId: request.id,
          details: {
            issues: parsedInput.error.issues
          }
        });
      }
      let updatedItem;
      try {
        updatedItem = await repository.updateAdminMenuItem({
          itemId,
          ...parsedInput.data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendError(reply, {
            statusCode: 400,
            code: "INVALID_CUSTOMIZATION_GROUPS_PAYLOAD",
            message: "customizationGroups payload is invalid",
            requestId: request.id,
            details: {
              issues: error.issues
            }
          });
        }
        throw error;
      }

      if (!updatedItem) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "MENU_ITEM_NOT_FOUND",
            message: "Menu item not found",
            requestId: request.id,
            details: { itemId }
          })
        );
      }

      return updatedItem;
    }
  );

  app.post(
    "/v1/catalog/admin/menu",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const input = adminMenuItemCreateSchema.parse(request.body);
      const createdItem = await repository.createAdminMenuItem(input);
      if (!createdItem) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "MENU_CATEGORY_NOT_FOUND",
            message: "Menu category not found",
            requestId: request.id,
            details: { categoryId: input.categoryId }
          })
        );
      }

      return createdItem;
    }
  );

  app.patch(
    "/v1/catalog/admin/menu/:itemId/visibility",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const input = adminMenuItemVisibilityUpdateSchema.parse(request.body);
      const updatedItem = await repository.updateAdminMenuItemVisibility({
        itemId,
        ...input
      });

      if (!updatedItem) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "MENU_ITEM_NOT_FOUND",
            message: "Menu item not found",
            requestId: request.id,
            details: { itemId }
          })
        );
      }

      return updatedItem;
    }
  );

  app.delete(
    "/v1/catalog/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);
      return adminMutationSuccessSchema.parse(await repository.deleteAdminMenuItem(itemId));
    }
  );

  app.get(
    "/v1/catalog/admin/store/config",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async () => repository.getAdminStoreConfig()
  );

  app.put(
    "/v1/catalog/admin/store/config",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const input = adminStoreConfigUpdateSchema.parse(request.body);
      return repository.updateAdminStoreConfig(input);
    }
  );

  app.post(
    "/v1/catalog/internal/locations/bootstrap",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const input = internalLocationBootstrapSchema.parse(request.body);
      return internalLocationSummarySchema.parse(await repository.bootstrapInternalLocation(input));
    }
  );

  app.get(
    "/v1/catalog/internal/locations",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async () =>
      internalLocationListResponseSchema.parse({
        locations: await repository.listInternalLocations()
      })
  );

  app.get(
    "/v1/catalog/internal/locations/:locationId",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const summary = await repository.getInternalLocationSummary(locationId);
      if (!summary) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "LOCATION_NOT_FOUND",
            message: "Location not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return internalLocationSummarySchema.parse(summary);
    }
  );

  app.post(
    "/v1/catalog/internal/ping",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const parsed = payloadSchema.parse(request.body ?? {});

      return {
        service: "catalog",
        accepted: true,
        payload: parsed
      };
    }
  );
}
