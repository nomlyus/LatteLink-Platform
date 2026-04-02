import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminMenuItemCreateSchema,
  adminMenuItemUpdateSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminStoreConfigUpdateSchema,
  internalLocationBootstrapSchema,
  internalLocationParamsSchema,
  internalLocationSummarySchema
} from "@gazelle/contracts-catalog";
import { z } from "zod";
import { createCatalogRepository } from "./repository.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const menuItemParamsSchema = z.object({
  itemId: z.string().min(1)
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

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
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

  app.get("/v1/store/config", async () => repository.getStoreConfig());

  app.get("/v1/catalog/admin/menu", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    return repository.getAdminMenu();
  });

  app.put("/v1/catalog/admin/menu/:itemId", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    const { itemId } = menuItemParamsSchema.parse(request.params);
    const input = adminMenuItemUpdateSchema.parse(request.body);
    const updatedItem = await repository.updateAdminMenuItem({
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
  });

  app.post("/v1/catalog/admin/menu", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

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
  });

  app.patch("/v1/catalog/admin/menu/:itemId/visibility", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

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
  });

  app.delete("/v1/catalog/admin/menu/:itemId", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    const { itemId } = menuItemParamsSchema.parse(request.params);
    return adminMutationSuccessSchema.parse(await repository.deleteAdminMenuItem(itemId));
  });

  app.get("/v1/catalog/admin/store/config", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    return repository.getAdminStoreConfig();
  });

  app.put("/v1/catalog/admin/store/config", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    const input = adminStoreConfigUpdateSchema.parse(request.body);
    return repository.updateAdminStoreConfig(input);
  });

  app.post("/v1/catalog/internal/locations/bootstrap", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    const input = internalLocationBootstrapSchema.parse(request.body);
    return internalLocationSummarySchema.parse(await repository.bootstrapInternalLocation(input));
  });

  app.get("/v1/catalog/internal/locations/:locationId", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

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
  });

  app.post("/v1/catalog/internal/ping", async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
      return;
    }

    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "catalog",
      accepted: true,
      payload: parsed
    };
  });
}
