import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminClientCreateRequestSchema,
  adminClientCreateResponseSchema,
  adminMenuItemCreateSchema,
  adminMenuItemImageUploadRequestSchema,
  adminMenuItemImageUploadResponseSchema,
  adminMenuItemUpdateSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminStoreConfigUpdateSchema,
  clientPaymentProfileSchema,
  internalClientDetailSchema,
  internalClientListResponseSchema,
  menuResponseSchema,
  internalLocationBootstrapSchema,
  internalLocationListResponseSchema,
  internalLocationPaymentProfileUpdateSchema,
  internalLocationParamsSchema,
  internalLocationSummarySchema,
  launchApprovalRequestSchema,
  mobileReleaseProfileUpdateSchema,
  onboardingSummarySchema,
  operatorOnboardingUpdateSchema,
  homeNewsCardCreateSchema,
  homeNewsCardUpdateSchema,
  homeNewsCardVisibilityUpdateSchema,
  homeNewsCardsResponseSchema,
  homeNewsCardSchema
} from "@lattelink/contracts-catalog";
import { getPersistenceReadinessMetadata } from "@lattelink/persistence";
import { z } from "zod";
import { createCatalogRepository } from "./repository.js";
import { resolveDefaultLocationId } from "./tenant.js";
import {
  createMenuImageUploadService,
  MenuImageUploadUnavailableError,
  MenuImageUploadValidationError
} from "./media-storage.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const locationIdQuerySchema = z.object({
  locationId: z.string().min(1).optional()
});
const publicCatalogCacheControl = "public, max-age=60, stale-while-revalidate=300";

const menuItemParamsSchema = z.object({
  itemId: z.string().min(1)
});
const cardParamsSchema = z.object({
  cardId: z.string().min(1)
});
const tenantParamsSchema = z.object({
  tenantId: z.string().min(1)
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

const operatorLocationHeadersSchema = z.object({
  "x-operator-location-id": z.string().min(1).optional()
});
const actorHeadersSchema = z.object({
  "x-user-id": z.string().min(1).optional()
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

async function recordAuditLog(
  request: FastifyRequest,
  repository: Awaited<ReturnType<typeof createCatalogRepository>>,
  entry: Parameters<Awaited<ReturnType<typeof createCatalogRepository>>["writeAuditLog"]>[0]
) {
  try {
    await repository.writeAuditLog(entry);
  } catch (error) {
    request.log.error(
      {
        error,
        requestId: request.id,
        auditAction: entry.action,
        targetId: entry.targetId
      },
      "audit log write failed"
    );
  }
}

function getActorId(request: FastifyRequest) {
  const parsed = actorHeadersSchema.safeParse(request.headers);
  return parsed.success ? (parsed.data["x-user-id"] ?? "system") : "system";
}

function missingLocationIdError(requestId: string) {
  return serviceErrorSchema.parse({
    code: "MISSING_LOCATION_ID",
    message: "locationId query parameter is required",
    requestId
  });
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createCatalogRepository(app.log);
  const menuImageUploads = createMenuImageUploadService();
  const gatewayApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const defaultLocationId = resolveDefaultLocationId();
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
      return { status: "ready", service: "catalog", persistence: repository.backend, environment: getPersistenceReadinessMetadata() };
    } catch {
      reply.status(503);
      return {
        status: "unavailable",
        service: "catalog",
        error: "Database unavailable",
        environment: getPersistenceReadinessMetadata()
      };
    }
  });

  app.get("/v1/app-config", async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const { locationId } = locationIdQuerySchema.parse(request.query);
    const resolvedLocationId = locationId ?? defaultLocationId;
    if (!resolvedLocationId) {
      return reply.status(400).send(missingLocationIdError(request.id));
    }
    return repository.getAppConfig(resolvedLocationId);
  });
  app.get("/v1/menu", async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const { locationId } = locationIdQuerySchema.parse(request.query);
    const resolvedLocationId = locationId ?? defaultLocationId;
    if (!resolvedLocationId) {
      return reply.status(400).send(missingLocationIdError(request.id));
    }
    return repository.getMenu(resolvedLocationId);
  });
  app.get("/v1/cards", async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const { locationId } = locationIdQuerySchema.parse(request.query);
    const resolvedLocationId = locationId ?? defaultLocationId;
    if (!resolvedLocationId) {
      return reply.status(400).send(missingLocationIdError(request.id));
    }
    return homeNewsCardsResponseSchema.parse(await repository.getHomeNewsCards(resolvedLocationId));
  });
  app.get("/v1/store/cards", async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const { locationId } = locationIdQuerySchema.parse(request.query);
    const resolvedLocationId = locationId ?? defaultLocationId;
    if (!resolvedLocationId) {
      return reply.status(400).send(missingLocationIdError(request.id));
    }
    return homeNewsCardsResponseSchema.parse(await repository.getHomeNewsCards(resolvedLocationId));
  });

  app.get("/v1/store/config", async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const { locationId } = locationIdQuerySchema.parse(request.query);
    const resolvedLocationId = locationId ?? defaultLocationId;
    if (!resolvedLocationId) {
      return reply.status(400).send(missingLocationIdError(request.id));
    }
    return repository.getStoreConfig(resolvedLocationId);
  });

  function getOperatorLocationId(request: FastifyRequest, reply: FastifyReply): string | undefined {
    const parsed = operatorLocationHeadersSchema.safeParse(request.headers);
    const locationId = (parsed.success ? parsed.data["x-operator-location-id"] : undefined) ?? defaultLocationId;
    if (!locationId) {
      sendError(reply, {
        statusCode: 400,
        code: "MISSING_OPERATOR_LOCATION_ID",
        message: "x-operator-location-id header is required",
        requestId: request.id
      });
      return undefined;
    }

    return locationId;
  }

  app.get(
    "/v1/catalog/admin/menu",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) {
        return reply;
      }
      return repository.getAdminMenu(locationId);
    }
  );

  app.get(
    "/v1/catalog/admin/cards",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) {
        return reply;
      }
      return repository.getAdminHomeNewsCards(locationId);
    }
  );

  app.put(
    "/v1/catalog/admin/cards",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = homeNewsCardsResponseSchema.parse(request.body);
      return homeNewsCardsResponseSchema.parse(await repository.replaceAdminHomeNewsCards(locationId, input));
    }
  );

  app.post(
    "/v1/catalog/admin/cards",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = homeNewsCardCreateSchema.parse(request.body);
      return homeNewsCardSchema.parse(await repository.createAdminHomeNewsCard(locationId, input));
    }
  );

  app.put(
    "/v1/catalog/admin/cards/:cardId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { cardId } = cardParamsSchema.parse(request.params);
      const input = homeNewsCardUpdateSchema.parse(request.body);
      const updatedCard = await repository.updateAdminHomeNewsCard(locationId, {
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

  app.post(
    "/v1/catalog/admin/menu/:itemId/image-upload",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const input = adminMenuItemImageUploadRequestSchema.parse(request.body);
      const appConfig = await repository.getAppConfig(locationId);
      const menu = await repository.getAdminMenu(locationId);
      const existingItem = menu.categories.flatMap((category) => category.items).find((item) => item.itemId === itemId);

      if (!existingItem) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "MENU_ITEM_NOT_FOUND",
            message: "Menu item not found",
            requestId: request.id,
            details: { itemId }
          })
        );
      }

      try {
        return adminMenuItemImageUploadResponseSchema.parse(
          await menuImageUploads.createUpload({
            brandId: appConfig.brand.brandId,
            locationId,
            itemId,
            fileName: input.fileName,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes
          })
        );
      } catch (error) {
        if (error instanceof MenuImageUploadUnavailableError) {
          return sendError(reply, {
            statusCode: 503,
            code: "MENU_IMAGE_UPLOAD_UNAVAILABLE",
            message: error.message,
            requestId: request.id
          });
        }

        if (error instanceof MenuImageUploadValidationError) {
          return sendError(reply, {
            statusCode: error.statusCode,
            code: "INVALID_MENU_IMAGE_UPLOAD",
            message: error.message,
            requestId: request.id
          });
        }

        request.log.error({ error, requestId: request.id, itemId, locationId }, "menu image upload session failed");
        return sendError(reply, {
          statusCode: 502,
          code: "MENU_IMAGE_UPLOAD_FAILED",
          message: "Unable to create a menu image upload session.",
          requestId: request.id
        });
      }
    }
  );

  app.patch(
    "/v1/catalog/admin/cards/:cardId/visibility",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { cardId } = cardParamsSchema.parse(request.params);
      const input = homeNewsCardVisibilityUpdateSchema.parse(request.body);
      const updatedCard = await repository.updateAdminHomeNewsCardVisibility(locationId, {
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
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { cardId } = cardParamsSchema.parse(request.params);
      return adminMutationSuccessSchema.parse(await repository.deleteAdminHomeNewsCard(locationId, cardId));
    }
  );

  app.put(
    "/v1/catalog/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
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
        updatedItem = await repository.updateAdminMenuItem(locationId, {
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

      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "operator",
        action: "menu_item.updated",
        targetId: itemId,
        targetType: "menu_item",
        payload: {
          name: parsedInput.data.name,
          priceCents: parsedInput.data.priceCents,
          visible: parsedInput.data.visible
        }
      });
      return updatedItem;
    }
  );

  app.post(
    "/v1/catalog/admin/menu",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = adminMenuItemCreateSchema.parse(request.body);
      const createdItem = await repository.createAdminMenuItem(locationId, input);
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

      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "operator",
        action: "menu_item.created",
        targetId: createdItem.itemId,
        targetType: "menu_item",
        payload: {
          categoryId: input.categoryId,
          name: input.name,
          priceCents: input.priceCents,
          visible: createdItem.visible
        }
      });
      return createdItem;
    }
  );

  app.patch(
    "/v1/catalog/admin/menu/:itemId/visibility",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const input = adminMenuItemVisibilityUpdateSchema.parse(request.body);
      const updatedItem = await repository.updateAdminMenuItemVisibility(locationId, {
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

      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "operator",
        action: "menu_item.visibility_changed",
        targetId: itemId,
        targetType: "menu_item",
        payload: {
          visible: input.visible
        }
      });
      return updatedItem;
    }
  );

  app.delete(
    "/v1/catalog/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { itemId } = menuItemParamsSchema.parse(request.params);
      return adminMutationSuccessSchema.parse(await repository.deleteAdminMenuItem(locationId, itemId));
    }
  );

  app.get(
    "/v1/catalog/admin/store/config",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      return repository.getAdminStoreConfig(locationId);
    }
  );

  app.put(
    "/v1/catalog/admin/store/config",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = adminStoreConfigUpdateSchema.parse(request.body);
      const updatedStoreConfig = await repository.updateAdminStoreConfig(locationId, input);
      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "operator",
        action: "store_config.updated",
        targetId: locationId,
        targetType: "location",
        payload: {
          storeName: updatedStoreConfig.storeName,
          hours: updatedStoreConfig.hours,
          taxRateBasisPoints: updatedStoreConfig.taxRateBasisPoints,
          fulfillmentMode: updatedStoreConfig.capabilities.operations.fulfillmentMode
        }
      });
      return updatedStoreConfig;
    }
  );

  app.post(
    "/v1/catalog/internal/clients",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const input = adminClientCreateRequestSchema.parse(request.body);
      return adminClientCreateResponseSchema.parse(await repository.createInternalClient(input));
    }
  );

  app.get(
    "/v1/catalog/internal/clients",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async () => internalClientListResponseSchema.parse(await repository.listInternalClients())
  );

  app.get(
    "/v1/catalog/internal/clients/:tenantId",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { tenantId } = tenantParamsSchema.parse(request.params);
      const client = await repository.getInternalClient(tenantId);
      if (!client) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "CLIENT_NOT_FOUND",
            message: "Client not found",
            requestId: request.id,
            details: { tenantId }
          })
        );
      }

      return internalClientDetailSchema.parse(client);
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

  app.get(
    "/v1/catalog/internal/locations/:locationId/onboarding",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const onboarding = await repository.getInternalLocationOnboarding(locationId);
      if (!onboarding) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "ONBOARDING_NOT_FOUND",
            message: "Onboarding state not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return onboardingSummarySchema.parse(onboarding);
    }
  );

  app.patch(
    "/v1/catalog/internal/locations/:locationId/onboarding",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = operatorOnboardingUpdateSchema.parse(request.body);
      const onboarding = await repository.updateInternalLocationOnboarding(locationId, input);
      if (!onboarding) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "ONBOARDING_NOT_FOUND",
            message: "Onboarding state not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return onboardingSummarySchema.parse(onboarding);
    }
  );

  app.post(
    "/v1/catalog/internal/locations/:locationId/launch-approval",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = launchApprovalRequestSchema.parse(request.body);
      const onboarding = await repository.approveInternalLocationLaunch(locationId, input);
      if (!onboarding) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "ONBOARDING_NOT_FOUND",
            message: "Onboarding state not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return onboardingSummarySchema.parse(onboarding);
    }
  );

  app.patch(
    "/v1/catalog/internal/locations/:locationId/mobile-release",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = mobileReleaseProfileUpdateSchema.parse(request.body);
      const onboarding = await repository.updateInternalLocationMobileRelease(locationId, input);
      if (!onboarding) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "ONBOARDING_NOT_FOUND",
            message: "Onboarding state not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return onboardingSummarySchema.parse(onboarding);
    }
  );

  app.get(
    "/v1/catalog/internal/locations/:locationId/payment-profile",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const paymentProfile = await repository.getInternalLocationPaymentProfile(locationId);
      if (!paymentProfile) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "PAYMENT_PROFILE_NOT_FOUND",
            message: "Payment profile not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return clientPaymentProfileSchema.parse(paymentProfile);
    }
  );

  app.put(
    "/v1/catalog/internal/locations/:locationId/menu",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
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

      const input = menuResponseSchema.parse({
        ...(typeof request.body === "object" && request.body !== null ? request.body : {}),
        locationId
      });
      return menuResponseSchema.parse(await repository.replaceInternalLocationMenu(locationId, input));
    }
  );

  app.get(
    "/v1/catalog/internal/locations/:locationId/menu",
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

      return menuResponseSchema.parse(await repository.getMenu(locationId));
    }
  );

  app.put(
    "/v1/catalog/internal/locations/:locationId/payment-profile",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
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

      const input = internalLocationPaymentProfileUpdateSchema.parse({
        ...(typeof request.body === "object" && request.body !== null ? request.body : {}),
        locationId
      });
      const updatedPaymentProfile = clientPaymentProfileSchema.parse(
        await repository.updateInternalLocationPaymentProfile(locationId, input)
      );
      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "internal_admin",
        action: "payment_profile.updated",
        targetId: locationId,
        targetType: "payment_profile",
        payload: {
          stripeAccountId: updatedPaymentProfile.stripeAccountId,
          stripeOnboardingStatus: updatedPaymentProfile.stripeOnboardingStatus,
          stripeChargesEnabled: updatedPaymentProfile.stripeChargesEnabled
        }
      });
      return updatedPaymentProfile;
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
