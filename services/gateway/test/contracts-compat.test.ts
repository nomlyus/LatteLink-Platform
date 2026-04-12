import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authContract } from "@lattelink/contracts-auth";
import { catalogContract } from "@lattelink/contracts-catalog";
import { loyaltyContract } from "@lattelink/contracts-loyalty";
import { notificationsContract } from "@lattelink/contracts-notifications";
import { ordersContract } from "@lattelink/contracts-orders";
import { buildApp } from "../src/app.js";

type ContractRoute = {
  method: string;
  path: string;
};

type RouteContract = {
  routes: Record<string, ContractRoute>;
};

type OpenApiSpec = {
  paths?: Record<string, Record<string, unknown> | undefined>;
};

type ExpectedRoute = {
  domain: string;
  route: string;
  method: string;
  path: string;
};

function normalizePath(path: string): string {
  const withOpenApiParams = path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  const collapsed = withOpenApiParams.replace(/\/+/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }

  return collapsed || "/";
}

function buildExpectedRoutes(input: {
  domain: string;
  contract: RouteContract;
  gatewayBasePath: string;
}): ExpectedRoute[] {
  const expected: ExpectedRoute[] = [];
  for (const [routeName, route] of Object.entries(input.contract.routes)) {
    expected.push({
      domain: input.domain,
      route: routeName,
      method: route.method.toLowerCase(),
      path: normalizePath(`${input.gatewayBasePath}${route.path}`)
    });
  }

  return expected;
}

function toPathOperations(spec: OpenApiSpec): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  for (const [rawPath, operations] of Object.entries(spec.paths ?? {})) {
    if (!operations) {
      continue;
    }

    map.set(normalizePath(rawPath), operations);
  }

  return map;
}

function assertContractCoverage(spec: OpenApiSpec) {
  const expectedRoutes = [
    ...buildExpectedRoutes({
      domain: "auth",
      contract: authContract,
      gatewayBasePath: "/auth"
    }),
    ...buildExpectedRoutes({
      domain: "catalog",
      contract: catalogContract,
      gatewayBasePath: ""
    }),
    ...buildExpectedRoutes({
      domain: "orders",
      contract: ordersContract,
      gatewayBasePath: "/orders"
    }),
    ...buildExpectedRoutes({
      domain: "loyalty",
      contract: loyaltyContract,
      gatewayBasePath: "/loyalty"
    }),
    ...buildExpectedRoutes({
      domain: "notifications",
      contract: notificationsContract,
      gatewayBasePath: "/devices"
    })
  ];
  const operationsByPath = toPathOperations(spec);

  for (const expected of expectedRoutes) {
    const pathOperations = operationsByPath.get(expected.path);
    expect(pathOperations, `Missing path ${expected.path} for ${expected.domain}.${expected.route}`).toBeDefined();

    if (!pathOperations) {
      continue;
    }

    expect(
      pathOperations[expected.method],
      `Missing method ${expected.method.toUpperCase()} on ${expected.path} for ${expected.domain}.${expected.route}`
    ).toBeDefined();
  }
}

describe("gateway contract compatibility", () => {
  it("covers all published contracts in runtime swagger", async () => {
    const app = await buildApp();
    await app.ready();
    const spec = app.swagger() as OpenApiSpec;

    assertContractCoverage(spec);
    await app.close();
  });

  it("keeps committed openapi spec compatible with published contracts", async () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const openApiPath = join(testDir, "..", "openapi", "openapi.json");
    const raw = await readFile(openApiPath, "utf8");
    const spec = JSON.parse(raw) as OpenApiSpec;

    assertContractCoverage(spec);
  });
});
