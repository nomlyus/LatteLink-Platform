import { describe, expect, it } from "vitest";
import { appIdentityProfileSchema, operatorAppIdentityProfileUpdateSchema, internalAppIdentityProfileUpdateSchema } from "@lattelink/contracts-catalog";
import { assignNomlyAppIdentifiers } from "../src/app-identity-assignment.js";

describe("Nomly-managed app identity", () => {
  it("assigns valid deterministic identifiers per location", () => {
    const assigned = assignNomlyAppIdentifiers("location-a", {});
    expect(assigned).toEqual(assignNomlyAppIdentifiers("location-a", {}));
    expect(assigned).not.toEqual(assignNomlyAppIdentifiers("location-b", {}));
    expect(assigned.bundleIdentifier).toMatch(/^us\.nomly\.app[a-f0-9]{24}$/);
    expect(assigned.sku).toMatch(/^nomly-[a-f0-9]{24}$/);
    expect(appIdentityProfileSchema.pick({ bundleIdentifier: true, sku: true }).parse(assigned)).toEqual(assigned);
  });

  it("preserves existing app-store identities and fills only missing identifiers", () => {
    const existing = { bundleIdentifier: "us.nomly.existing", sku: "existing-ios" };
    expect(assignNomlyAppIdentifiers("location-a", existing)).toEqual(existing);
    expect(assignNomlyAppIdentifiers("location-a", { sku: existing.sku })).toMatchObject({ sku: existing.sku });
    expect(assignNomlyAppIdentifiers("location-a", { bundleIdentifier: existing.bundleIdentifier })).toMatchObject({ bundleIdentifier: existing.bundleIdentifier });
  });

  it("strips operator-supplied identifiers while retaining the internal Nomly contract", () => {
    const input = { appName: "Coffee", bundleIdentifier: "us.operator.chosen", sku: "operator-chosen" };
    expect(operatorAppIdentityProfileUpdateSchema.parse(input)).toEqual({ appName: "Coffee" });
    expect(internalAppIdentityProfileUpdateSchema.parse(input)).toMatchObject(input);
  });
});
