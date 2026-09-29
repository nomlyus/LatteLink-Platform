import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminClientCreateRequestSchema,
  adminClientCreateResponseSchema,
  adminMenuCategoryCreateSchema,
  adminMenuCategoryReorderSchema,
  adminMenuCategorySchema,
  adminMenuCategoryUpdateSchema,
  adminMenuItemCreateSchema,
  adminMenuItemImageUploadRequestSchema,
  adminMenuItemImageUploadResponseSchema,
  adminMenuItemUpdateSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminModifierGroupCreateSchema,
  adminMutationSuccessSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  clientPaymentProfileSchema,
  internalClientDetailSchema,
  internalClientListResponseSchema,
  internalLocationCapabilitiesUpdateSchema,
  menuResponseSchema,
  modifierGroupSchema,
  internalLocationBootstrapSchema,
  internalLocationListResponseSchema,
  internalLocationPaymentProfileUpdateSchema,
  internalLocationParamsSchema,
  internalLocationSummarySchema,
  internalAppIdentityProfileUpdateSchema,
  internalOwnerOnboardingUpdateSchema,
  launchApprovalRequestSchema,
  mobileBrandBootstrapRequestSchema,
  mobileBrandBootstrapSchema,
  mobileExperienceDocumentSchema,
  mobileExperienceDraftResponseSchema,
  mobileExperiencePublishRequestSchema,
  mobileExperienceRollbackRequestSchema,
  mobileExperienceSaveDraftRequestSchema,
  mobileExperienceVersionsResponseSchema,
  mobileReleaseBuildJobApprovalSchema,
  mobileReleaseBuildJobCreateSchema,
  mobileReleaseBuildJobClaimResponseSchema,
  mobileReleaseBuildJobListResponseSchema,
  mobileReleaseBuildJobSchema,
  mobileReleaseBuildJobUpdateSchema,
  mobileReleaseProfileUpdateSchema,
  onboardingSummarySchema,
  operatorAppIdentityProfileUpdateSchema,
  operatorOnboardingUpdateSchema,
  publicCustomerLocationRequestSchema,
  storeConfigResponseSchema,
  homeNewsCardCreateSchema,
  homeNewsCardUpdateSchema,
  homeNewsCardVisibilityUpdateSchema,
  homeNewsCardsResponseSchema,
  homeNewsCardSchema,
  isPlatformManagedMenu
} from "@lattelink/contracts-catalog";
import { getPersistenceReadinessMetadata } from "@lattelink/persistence";
import { z } from "zod";
import { CatalogMutationError, createCatalogRepository, MobileReleaseBuildJobError } from "./repository.js";
import { MobileBrandBootstrapConfigurationError } from "./mobile-brand-bootstrap.js";
import { isPublicCustomerLocationAccessible } from "./public-location-access.js";
import { resolveDefaultLocationId } from "./tenant.js";
import {
  createMenuImageUploadService,
  MenuImageUploadUnavailableError,
  MenuImageUploadValidationError
} from "./media-storage.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const publicCatalogCacheControl = "public, max-age=60, stale-while-revalidate=300";
const publicCustomerLocationQueryJsonSchema = {
  type: "object",
  required: ["brandId", "locationId"],
  additionalProperties: false,
  properties: {
    brandId: { type: "string", minLength: 1, maxLength: 160 },
    locationId: { type: "string", minLength: 1, maxLength: 160 }
  }
} as const;

const menuItemParamsSchema = z.object({
  itemId: z.string().min(1)
});
const cardParamsSchema = z.object({
  cardId: z.string().min(1)
});
const categoryParamsSchema = z.object({
  categoryId: z.string().min(1)
});
const modifierGroupParamsSchema = z.object({
  modifierGroupId: z.string().min(1)
});
const tenantParamsSchema = z.object({
  tenantId: z.string().min(1)
});
const mobileReleaseBuildJobParamsSchema = z.object({
  jobId: z.string().uuid()
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

function sendCatalogMutationError(reply: FastifyReply, request: FastifyRequest, error: unknown) {
  if (!(error instanceof CatalogMutationError)) {
    return undefined;
  }

  return sendError(reply, {
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
    requestId: request.id,
    details: error.details
  });
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
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

function locationNotFoundError(requestId: string, locationId: string) {
  return serviceErrorSchema.parse({
    code: "LOCATION_NOT_FOUND",
    message: "Location not found",
    requestId,
    details: { locationId }
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
  const getPublicLocationContext = async (locationId: string) => {
    const [appConfig, storeConfig] = await Promise.all([
      repository.getAppConfig(locationId),
      repository.getStoreConfig(locationId)
    ]);

    return appConfig && storeConfig ? { appConfig, storeConfig } : undefined;
  };
  const resolvePublicCustomerLocation = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = publicCustomerLocationRequestSchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400).send(serviceErrorSchema.parse({
        code: "INVALID_PUBLIC_LOCATION_REQUEST",
        message: "Valid brandId and locationId query parameters are required.",
        requestId: request.id
      }));
      return undefined;
    }

    const accessible = await isPublicCustomerLocationAccessible({
      ...parsed.data,
      doesLocationBelongToBrand: repository.doesLocationBelongToBrand.bind(repository),
      isCustomerLocationLaunchableForBrand: repository.isCustomerLocationLaunchableForBrand.bind(repository)
    });
    if (!accessible) {
      reply.status(404).send(serviceErrorSchema.parse({
        code: "PUBLIC_LOCATION_NOT_AVAILABLE",
        message: "Location not available.",
        requestId: request.id
      }));
      return undefined;
    }

    return parsed.data;
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

  app.get(
    "/v1/mobile/bootstrap",
    { preHandler: app.rateLimit(gatewayReadRateLimit) },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const parsedRequest = mobileBrandBootstrapRequestSchema.safeParse(request.query);
      if (!parsedRequest.success) {
        return reply.status(400).send(
          serviceErrorSchema.parse({
            code: "INVALID_MOBILE_BRAND_BOOTSTRAP_REQUEST",
            message: "A valid brandId query parameter is required.",
            requestId: request.id
          })
        );
      }

      try {
        const bootstrap = await repository.getMobileBrandBootstrap(parsedRequest.data.brandId);
        if (!bootstrap) {
          return reply.status(404).send(
            serviceErrorSchema.parse({
              code: "MOBILE_BRAND_NOT_FOUND",
              message: "Branded app configuration was not found.",
              requestId: request.id
            })
          );
        }

        return mobileBrandBootstrapSchema.parse(bootstrap);
      } catch (error) {
        if (error instanceof MobileBrandBootstrapConfigurationError) {
          return reply.status(503).send(
            serviceErrorSchema.parse({
              code: "MOBILE_BRAND_CONFIGURATION_UNAVAILABLE",
              message: "Branded app configuration is temporarily unavailable.",
              requestId: request.id
            })
          );
        }
        throw error;
      }
    }
  );

  // Internal preflight for order/payment services. It deliberately returns no tenant or readiness metadata.
  app.get(
    "/v1/catalog/internal/public-location-access",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess],
      schema: { querystring: publicCustomerLocationQueryJsonSchema },
      attachValidation: true
    },
    async (request, reply) => {
      const access = await resolvePublicCustomerLocation(request, reply);
      if (!access) return reply;
      return reply.status(204).send();
    }
  );

  // Internal services that already established the customer request context (for example, a
  // payment confirmation) need store configuration without using a public customer read route.
  app.get(
    "/v1/catalog/internal/locations/:locationId/store-config",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess],
      schema: {
        params: {
          type: "object",
          required: ["locationId"],
          additionalProperties: false,
          properties: { locationId: { type: "string", minLength: 1 } }
        }
      }
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const storeConfig = await repository.getStoreConfig(locationId);
      if (!storeConfig) {
        return reply.status(404).send(serviceErrorSchema.parse({
          code: "STORE_CONFIG_NOT_FOUND",
          message: "Store configuration was not found.",
          requestId: request.id
        }));
      }
      return storeConfigResponseSchema.parse(storeConfig);
    }
  );

  app.get(
    "/v1/catalog/internal/locations/:locationId/app-config",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess],
      schema: {
        params: {
          type: "object",
          required: ["locationId"],
          additionalProperties: false,
          properties: { locationId: { type: "string", minLength: 1 } }
        }
      }
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const appConfig = await repository.getAppConfig(locationId);
      if (!appConfig) {
        return reply.status(404).send(serviceErrorSchema.parse({
          code: "APP_CONFIG_NOT_FOUND",
          message: "App configuration was not found.",
          requestId: request.id
        }));
      }
      return appConfigSchema.parse(appConfig);
    }
  );

  app.get("/v1/app-config", { schema: { querystring: publicCustomerLocationQueryJsonSchema }, attachValidation: true }, async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const access = await resolvePublicCustomerLocation(request, reply);
    if (!access) return reply;
    const locationContext = await getPublicLocationContext(access.locationId);
    if (!locationContext) {
      return reply.status(404).send(locationNotFoundError(request.id, access.locationId));
    }
    return locationContext.appConfig;
  });
  app.get("/v1/menu", { schema: { querystring: publicCustomerLocationQueryJsonSchema }, attachValidation: true }, async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const access = await resolvePublicCustomerLocation(request, reply);
    if (!access) return reply;
    const locationContext = await getPublicLocationContext(access.locationId);
    if (!locationContext) {
      return reply.status(404).send(locationNotFoundError(request.id, access.locationId));
    }
    return repository.getMenu(access.locationId);
  });
  app.get("/v1/cards", { schema: { querystring: publicCustomerLocationQueryJsonSchema }, attachValidation: true }, async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const access = await resolvePublicCustomerLocation(request, reply);
    if (!access) return reply;
    const locationContext = await getPublicLocationContext(access.locationId);
    if (!locationContext) {
      return reply.status(404).send(locationNotFoundError(request.id, access.locationId));
    }
    return homeNewsCardsResponseSchema.parse(await repository.getHomeNewsCards(access.locationId));
  });
  app.get("/v1/store/cards", { schema: { querystring: publicCustomerLocationQueryJsonSchema }, attachValidation: true }, async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const access = await resolvePublicCustomerLocation(request, reply);
    if (!access) return reply;
    const locationContext = await getPublicLocationContext(access.locationId);
    if (!locationContext) {
      return reply.status(404).send(locationNotFoundError(request.id, access.locationId));
    }
    return homeNewsCardsResponseSchema.parse(await repository.getHomeNewsCards(access.locationId));
  });

  app.get("/v1/store/config", { schema: { querystring: publicCustomerLocationQueryJsonSchema }, attachValidation: true }, async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const access = await resolvePublicCustomerLocation(request, reply);
    if (!access) return reply;
    const locationContext = await getPublicLocationContext(access.locationId);
    if (!locationContext) {
      return reply.status(404).send(locationNotFoundError(request.id, access.locationId));
    }
    return locationContext.storeConfig;
  });

  app.get("/v1/mobile-experience", { schema: { querystring: publicCustomerLocationQueryJsonSchema }, attachValidation: true }, async (request, reply) => {
    reply.header("cache-control", publicCatalogCacheControl);
    const access = await resolvePublicCustomerLocation(request, reply);
    if (!access) return reply;
    const locationContext = await getPublicLocationContext(access.locationId);
    if (!locationContext) {
      return reply.status(404).send(locationNotFoundError(request.id, access.locationId));
    }
    return mobileExperienceDocumentSchema.parse(await repository.getPublishedMobileExperience(access.locationId));
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

  app.post(
    "/v1/catalog/admin/menu/categories",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      try {
        const category = await repository.createAdminMenuCategory(locationId, adminMenuCategoryCreateSchema.parse(request.body));
        return category ? adminMenuCategorySchema.parse(category) : reply.status(500).send();
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
    }
  );

  app.put(
    "/v1/catalog/admin/menu/categories/:categoryId",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { categoryId } = categoryParamsSchema.parse(request.params);
      try {
        const category = await repository.updateAdminMenuCategory(locationId, {
          categoryId,
          ...adminMenuCategoryUpdateSchema.omit({ categoryId: true }).parse(request.body)
        });
        if (!category) return sendError(reply, { statusCode: 404, code: "MENU_CATEGORY_NOT_FOUND", message: "Menu category not found", requestId: request.id, details: { categoryId } });
        return adminMenuCategorySchema.parse(category);
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
    }
  );

  app.post(
    "/v1/catalog/admin/menu/categories/reorder",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      try {
        return repository.reorderAdminMenuCategories(locationId, adminMenuCategoryReorderSchema.parse(request.body));
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
    }
  );

  app.delete(
    "/v1/catalog/admin/menu/categories/:categoryId",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { categoryId } = categoryParamsSchema.parse(request.params);
      try {
        return adminMutationSuccessSchema.parse(await repository.deleteAdminMenuCategory(locationId, categoryId));
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
    }
  );

  app.get(
    "/v1/catalog/admin/menu/modifier-groups",
    { preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const menu = await repository.getAdminMenu(locationId);
      return menu.modifierGroups;
    }
  );

  app.post(
    "/v1/catalog/admin/menu/modifier-groups",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      try {
        const group = await repository.createAdminModifierGroup(locationId, adminModifierGroupCreateSchema.parse(request.body));
        return group ? modifierGroupSchema.parse(group) : reply.status(500).send();
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
    }
  );

  app.put(
    "/v1/catalog/admin/menu/modifier-groups/:modifierGroupId",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { modifierGroupId } = modifierGroupParamsSchema.parse(request.params);
      try {
        const group = await repository.updateAdminModifierGroup(locationId, {
          ...adminModifierGroupCreateSchema.parse(request.body),
          id: modifierGroupId
        });
        if (!group) return sendError(reply, { statusCode: 404, code: "MODIFIER_GROUP_NOT_FOUND", message: "Modifier group not found", requestId: request.id, details: { modifierGroupId } });
        return modifierGroupSchema.parse(group);
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
    }
  );

  app.delete(
    "/v1/catalog/admin/menu/modifier-groups/:modifierGroupId",
    { preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess] },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const { modifierGroupId } = modifierGroupParamsSchema.parse(request.params);
      try {
        return adminMutationSuccessSchema.parse(await repository.deleteAdminModifierGroup(locationId, modifierGroupId));
      } catch (error) {
        return sendCatalogMutationError(reply, request, error) ?? Promise.reject(error);
      }
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
      if (!appConfig) {
        return reply.status(404).send(locationNotFoundError(request.id, locationId));
      }
      if (!isPlatformManagedMenu(appConfig)) {
        return sendCatalogMutationError(
          reply,
          request,
          new CatalogMutationError(
            "CATALOG_EXTERNAL_SYNC_READ_ONLY",
            "This catalog is managed by an external synchronization source and cannot receive operator image changes."
          )
        );
      }
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
      const parsedInput = adminMenuItemUpdateSchema.safeParse(request.body);
      if (!parsedInput.success) {
        const isCompatibilityCustomizationPayload = Boolean(
          request.body && typeof request.body === "object" && "customizationGroups" in request.body
        );
        return sendError(reply, {
          statusCode: 400,
          code: isCompatibilityCustomizationPayload ? "INVALID_CUSTOMIZATION_GROUPS_PAYLOAD" : "INVALID_MENU_ITEM_UPDATE_PAYLOAD",
          message: isCompatibilityCustomizationPayload ? "customizationGroups payload is invalid" : "Menu item update payload is invalid",
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
        const mutationError = sendCatalogMutationError(reply, request, error);
        if (mutationError) return mutationError;
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
      let createdItem;
      try {
        createdItem = await repository.createAdminMenuItem(locationId, input);
      } catch (error) {
        const mutationError = sendCatalogMutationError(reply, request, error);
        if (mutationError) return mutationError;
        throw error;
      }
      if (!createdItem) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "MENU_CATEGORY_NOT_FOUND",
            message: "Menu category not found",
            requestId: request.id,
            details: { categoryId: input.categoryId ?? input.categoryIds?.[0] }
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

  app.patch(
    "/v1/catalog/admin/app-identity",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = operatorAppIdentityProfileUpdateSchema.parse(request.body);
      let onboarding: Awaited<ReturnType<typeof repository.updateOperatorLocationAppIdentity>>;
      try {
        onboarding = await repository.updateOperatorLocationAppIdentity(locationId, input);
      } catch (error) {
        if (error instanceof MobileReleaseBuildJobError) {
          return sendError(reply, {
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            requestId: request.id,
            details: error.details
          });
        }
        throw error;
      }
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
      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "operator",
        action: "app_identity.updated",
        targetId: locationId,
        targetType: "app_identity",
        payload: {
          appName: onboarding.appIdentity?.appName,
          displayName: onboarding.appIdentity?.displayName,
          bundleIdentifier: onboarding.appIdentity?.bundleIdentifier,
          ready: onboarding.appIdentity?.readiness.ready
        }
      });
      return onboardingSummarySchema.parse(onboarding);
    }
  );

  app.get(
    "/v1/catalog/admin/mobile-experience",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      return mobileExperienceDraftResponseSchema.parse(await repository.getAdminMobileExperience(locationId));
    }
  );

  app.get(
    "/v1/catalog/admin/mobile-experience/versions",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      return mobileExperienceVersionsResponseSchema.parse(await repository.listAdminMobileExperienceVersions(locationId));
    }
  );

  app.get(
    "/v1/catalog/admin/mobile-release/build-jobs",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      return mobileReleaseBuildJobListResponseSchema.parse(
        await repository.listInternalLocationMobileReleaseBuildJobs(locationId)
      );
    }
  );

  app.put(
    "/v1/catalog/admin/mobile-experience/draft",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = mobileExperienceSaveDraftRequestSchema.parse(request.body);
      const draft = await repository.saveAdminMobileExperienceDraft(locationId, input);
      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "operator",
        action: "mobile_experience.draft_saved",
        targetId: draft.draft.versionId,
        targetType: "mobile_experience",
        payload: {
          templateId: draft.draft.templateId,
          sections: draft.draft.screens.flatMap((screen) => screen.sections.map((section) => section.type))
        }
      });
      return mobileExperienceDraftResponseSchema.parse(draft);
    }
  );

  app.post(
    "/v1/catalog/admin/mobile-experience/publish",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = mobileExperiencePublishRequestSchema.parse(request.body);
      try {
        const published = await repository.publishAdminMobileExperience(locationId, input.draftVersionId);
        await recordAuditLog(request, repository, {
          locationId,
          actorId: getActorId(request),
          actorType: "operator",
          action: "mobile_experience.published",
          targetId: published.versionId,
          targetType: "mobile_experience",
          payload: {
            templateId: published.templateId,
            publishedAt: published.publishedAt
          }
        });
        return mobileExperienceDocumentSchema.parse(published);
      } catch (error) {
        return sendError(reply, {
          statusCode: 409,
          code: "MOBILE_EXPERIENCE_DRAFT_CONFLICT",
          message: error instanceof Error ? error.message : "Mobile experience draft could not be published.",
          requestId: request.id
        });
      }
    }
  );

  app.post(
    "/v1/catalog/admin/mobile-experience/rollback",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const locationId = getOperatorLocationId(request, reply);
      if (!locationId) return reply;
      const input = mobileExperienceRollbackRequestSchema.parse(request.body);
      try {
        const published = await repository.rollbackAdminMobileExperience(locationId, input.versionId);
        await recordAuditLog(request, repository, {
          locationId,
          actorId: getActorId(request),
          actorType: "operator",
          action: "mobile_experience.rolled_back",
          targetId: published.versionId,
          targetType: "mobile_experience",
          payload: {
            restoredVersionId: input.versionId,
            publishedAt: published.publishedAt
          }
        });
        return mobileExperienceDocumentSchema.parse(published);
      } catch (error) {
        return sendError(reply, {
          statusCode: 404,
          code: "MOBILE_EXPERIENCE_VERSION_NOT_FOUND",
          message: error instanceof Error ? error.message : "Mobile experience version could not be restored.",
          requestId: request.id
        });
      }
    }
  );

  app.post(
    "/v1/catalog/internal/clients",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const input = adminClientCreateRequestSchema.parse(request.body);
      const created = adminClientCreateResponseSchema.parse(await repository.createInternalClient(input));
      await recordAuditLog(request, repository, {
        locationId: created.locationId,
        actorId: getActorId(request),
        actorType: "system",
        action: "merchant_signup.bootstrap_requested",
        targetId: created.tenantId,
        targetType: "catalog_client",
        payload: {
          clientName: input.clientName,
          locationName: input.locationName,
          marketLabel: input.marketLabel,
          ownerEmail: input.ownerEmail.trim().toLowerCase()
        }
      });

      return created;
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

  app.put(
    "/v1/catalog/internal/locations/:locationId/capabilities",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = internalLocationCapabilitiesUpdateSchema.parse(request.body);
      const summary = await repository.updateInternalLocationCapabilities(locationId, input);
      if (!summary) {
        return reply.status(404).send(locationNotFoundError(request.id, locationId));
      }

      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "internal_admin",
        action: "location.capabilities.updated",
        targetId: locationId,
        targetType: "location",
        payload: input
      });

      return internalLocationSummarySchema.parse(summary);
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

      await recordAuditLog(request, repository, {
        locationId,
        actorId: getActorId(request),
        actorType: "system",
        action: "merchant_signup.owner_onboarding_updated",
        targetId: locationId,
        targetType: "onboarding_progress",
        payload: input
      });

      return onboardingSummarySchema.parse(onboarding);
    }
  );

  app.patch(
    "/v1/catalog/internal/locations/:locationId/owner-onboarding",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = internalOwnerOnboardingUpdateSchema.parse(request.body);
      const onboarding = await repository.updateInternalLocationOwnerOnboarding(locationId, input);
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
    "/v1/catalog/internal/locations/:locationId/app-identity",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = internalAppIdentityProfileUpdateSchema.parse(request.body);
      let onboarding: Awaited<ReturnType<typeof repository.updateInternalLocationAppIdentity>>;
      try {
        onboarding = await repository.updateInternalLocationAppIdentity(locationId, input);
      } catch (error) {
        if (error instanceof MobileReleaseBuildJobError) {
          return sendError(reply, {
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            requestId: request.id,
            details: error.details
          });
        }
        throw error;
      }
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
    "/v1/catalog/internal/locations/:locationId/mobile-release/build-jobs",
    {
      preHandler: [app.rateLimit(gatewayReadRateLimit), requireGatewayAccess]
    },
    async (request) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      return mobileReleaseBuildJobListResponseSchema.parse(
        await repository.listInternalLocationMobileReleaseBuildJobs(locationId)
      );
    }
  );

  app.post(
    "/v1/catalog/internal/locations/:locationId/mobile-release/build-jobs",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);
      const input = mobileReleaseBuildJobCreateSchema.parse(request.body);
      let job: Awaited<ReturnType<typeof repository.createInternalLocationMobileReleaseBuildJob>>;
      try {
        job = await repository.createInternalLocationMobileReleaseBuildJob(locationId, {
          ...input,
          requestedBy: input.requestedBy ?? getActorId(request)
        });
      } catch (error) {
        if (error instanceof MobileReleaseBuildJobError) {
          return sendError(reply, {
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            requestId: request.id,
            details: error.details
          });
        }
        if (isUniqueViolation(error)) {
          return sendError(reply, {
            statusCode: 409,
            code: "MOBILE_RELEASE_BUILD_ALREADY_ACTIVE",
            message: "This merchant already has an active mobile release build. Wait for it to finish before starting another.",
            requestId: request.id
          });
        }
        throw error;
      }
      if (!job) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "ONBOARDING_NOT_FOUND",
            message: "Onboarding state not found",
            requestId: request.id,
            details: { locationId }
          })
        );
      }

      return mobileReleaseBuildJobSchema.parse(job);
    }
  );

  app.post(
    "/v1/catalog/internal/mobile-release/build-jobs/claim",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async () =>
      mobileReleaseBuildJobClaimResponseSchema.parse({
        job: await repository.claimNextMobileReleaseBuildJob()
      })
  );

  app.patch(
    "/v1/catalog/internal/mobile-release/build-jobs/:jobId",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { jobId } = mobileReleaseBuildJobParamsSchema.parse(request.params);
      const input = mobileReleaseBuildJobUpdateSchema.parse(request.body);
      let job: Awaited<ReturnType<typeof repository.updateMobileReleaseBuildJob>>;
      try {
        job = await repository.updateMobileReleaseBuildJob(jobId, input);
      } catch (error) {
        if (error instanceof MobileReleaseBuildJobError) {
          return sendError(reply, {
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            requestId: request.id,
            details: error.details
          });
        }
        throw error;
      }
      if (!job) {
        return reply.status(404).send(
          serviceErrorSchema.parse({
            code: "MOBILE_RELEASE_BUILD_JOB_NOT_FOUND",
            message: "Mobile release build job not found",
            requestId: request.id,
            details: { jobId }
          })
        );
      }
      return mobileReleaseBuildJobSchema.parse(job);
    }
  );

  app.post(
    "/v1/catalog/internal/mobile-release/build-jobs/:jobId/approve",
    {
      preHandler: [app.rateLimit(gatewayWriteRateLimit), requireGatewayAccess]
    },
    async (request, reply) => {
      const { jobId } = mobileReleaseBuildJobParamsSchema.parse(request.params);
      const input = mobileReleaseBuildJobApprovalSchema.parse(request.body);
      const job = await repository.approveMobileReleaseBuildJob(jobId, input);
      if (!job) {
        return reply.status(409).send(
          serviceErrorSchema.parse({
            code: "MOBILE_RELEASE_BUILD_NOT_AWAITING_APPROVAL",
            message: "The mobile release build is not awaiting approval.",
            requestId: request.id,
            details: { jobId }
          })
        );
      }
      return mobileReleaseBuildJobSchema.parse(job);
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
