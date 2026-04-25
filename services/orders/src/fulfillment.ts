import {
  DEFAULT_APP_CONFIG_FULFILLMENT,
  appConfigSchema,
  appConfigFulfillmentModeSchema,
  type AppConfigFulfillment
} from "@lattelink/contracts-catalog";
import { orderSchema, orderStatusSchema } from "@lattelink/contracts-orders";
import { z } from "zod";
import { advanceOrderLifecycleToStatus, isTerminalOrderStatus } from "./lifecycle.js";

type Order = z.output<typeof orderSchema>;
type OrderStatus = z.output<typeof orderStatusSchema>;

const timeBasedFulfillmentFlow = ["PAID", "IN_PREP", "READY", "COMPLETED"] as const satisfies readonly OrderStatus[];

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function resolveConfiguredFulfillmentMode(value: string | undefined) {
  const normalized = trimToUndefined(value)?.toLowerCase().replaceAll("-", "_");
  const parsed = appConfigFulfillmentModeSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return DEFAULT_APP_CONFIG_FULFILLMENT.mode;
}

function getTimeBasedFulfillmentThresholdsMs(fulfillment: AppConfigFulfillment) {
  return {
    PAID: 0,
    IN_PREP: fulfillment.timeBasedScheduleMinutes.inPrep * 60_000,
    READY: fulfillment.timeBasedScheduleMinutes.ready * 60_000,
    COMPLETED: fulfillment.timeBasedScheduleMinutes.completed * 60_000
  } as const satisfies Record<(typeof timeBasedFulfillmentFlow)[number], number>;
}

export function resolveConfiguredOrderFulfillment(
  env: Record<string, string | undefined> = process.env
): AppConfigFulfillment {
  return {
    ...DEFAULT_APP_CONFIG_FULFILLMENT,
    mode: resolveConfiguredFulfillmentMode(env.ORDER_FULFILLMENT_MODE)
  };
}

export function createFulfillmentConfigCache(params: {
  catalogBaseUrl: string;
  ttlMs?: number;
}): { get: (locationId?: string) => Promise<AppConfigFulfillment> } {
  const ttlMs = params.ttlMs ?? 30_000;
  type CacheEntry = {
    value: AppConfigFulfillment;
    fetchedAt: number;
    refreshing?: Promise<void>;
  };
  const defaultValue = resolveConfiguredOrderFulfillment();
  const cache = new Map<string, CacheEntry>();

  function getCacheEntry(locationId?: string) {
    const key = trimToUndefined(locationId) ?? "__default__";
    let entry = cache.get(key);
    if (!entry) {
      entry = {
        value: defaultValue,
        fetchedAt: 0,
        refreshing: undefined
      };
      cache.set(key, entry);
    }

    return { key, entry };
  }

  async function refresh(locationId?: string): Promise<void> {
    const { entry } = getCacheEntry(locationId);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      let response: Response;
      try {
        const url = new URL("/v1/app-config", params.catalogBaseUrl);
        const normalizedLocationId = trimToUndefined(locationId);
        if (normalizedLocationId) {
          url.searchParams.set("locationId", normalizedLocationId);
        }
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (response.ok) {
        const body = await response.json();
        const parsed = appConfigSchema.safeParse(body);
        if (parsed.success) {
          entry.value = parsed.data.fulfillment;
          entry.fetchedAt = Date.now();
        }
      }
    } catch {
      // keep last known value
    } finally {
      entry.refreshing = undefined;
    }
  }

  return {
    async get(locationId) {
      const { entry } = getCacheEntry(locationId);
      if (Date.now() - entry.fetchedAt > ttlMs) {
        if (!entry.refreshing) {
          entry.refreshing = refresh(locationId);
        }
        await entry.refreshing;
      }
      return entry.value;
    }
  };
}

export type TimeBasedFulfillmentStatus = (typeof timeBasedFulfillmentFlow)[number];

export type ReconcileOrderFulfillmentStateResult = {
  order: Order;
  changed: boolean;
  appendedStatuses: Array<Exclude<TimeBasedFulfillmentStatus, "PAID">>;
};

function getPaidTimelineEntry(order: Order) {
  return order.timeline.find((entry) => entry.status === "PAID");
}

function getTimeBasedFulfillmentTargetStatus(
  paidOccurredAt: Date,
  now: Date,
  thresholdsMs: Record<TimeBasedFulfillmentStatus, number>
): TimeBasedFulfillmentStatus {
  const elapsedMs = now.getTime() - paidOccurredAt.getTime();

  if (!Number.isFinite(elapsedMs) || elapsedMs < thresholdsMs.IN_PREP) {
    return "PAID";
  }

  if (elapsedMs < thresholdsMs.READY) {
    return "IN_PREP";
  }

  if (elapsedMs < thresholdsMs.COMPLETED) {
    return "READY";
  }

  return "COMPLETED";
}

export function reconcileOrderFulfillmentState(
  order: Order,
  options: {
    now?: Date;
    fulfillment?: AppConfigFulfillment;
  } = {}
): ReconcileOrderFulfillmentStateResult {
  const now = options.now ?? new Date();
  const fulfillment = options.fulfillment ?? DEFAULT_APP_CONFIG_FULFILLMENT;
  if (fulfillment.mode !== "time_based") {
    return {
      order,
      changed: false,
      appendedStatuses: []
    };
  }

  if (order.status === "PENDING_PAYMENT" || isTerminalOrderStatus(order.status)) {
    return {
      order,
      changed: false,
      appendedStatuses: []
    };
  }

  const paidTimelineEntry = getPaidTimelineEntry(order);
  if (!paidTimelineEntry) {
    return {
      order,
      changed: false,
      appendedStatuses: []
    };
  }

  const paidOccurredAtMs = Date.parse(paidTimelineEntry.occurredAt);
  if (!Number.isFinite(paidOccurredAtMs)) {
    return {
      order,
      changed: false,
      appendedStatuses: []
    };
  }

  const thresholdsMs = getTimeBasedFulfillmentThresholdsMs(fulfillment);
  const targetStatus = getTimeBasedFulfillmentTargetStatus(new Date(paidOccurredAtMs), now, thresholdsMs);
  const currentIndex = timeBasedFulfillmentFlow.indexOf(order.status as TimeBasedFulfillmentStatus);
  const targetIndex = timeBasedFulfillmentFlow.indexOf(targetStatus);
  if (currentIndex !== -1 && targetIndex !== -1 && targetIndex <= currentIndex) {
    return {
      order,
      changed: false,
      appendedStatuses: []
    };
  }

  if (order.status === targetStatus) {
    return {
      order,
      changed: false,
      appendedStatuses: []
    };
  }

  const targetOrder = advanceOrderLifecycleToStatus(order, targetStatus, {
    resolveStepMetadata: ({ nextStatus }) => ({
      occurredAt: new Date(
        paidOccurredAtMs + thresholdsMs[nextStatus as TimeBasedFulfillmentStatus]
      ).toISOString(),
      source: "system"
    })
  });

  return {
    order: targetOrder.order,
    changed: targetOrder.changed,
    appendedStatuses: targetOrder.appliedTransitions.map((transition) => transition.toStatus).filter(
      (status): status is Exclude<TimeBasedFulfillmentStatus, "PAID"> => status !== "PAID"
    )
  };
}
