import { orderSchema, orderStatusSchema, orderTimelineEntrySchema } from "@lattelink/contracts-orders";
import { z } from "zod";

type Order = z.output<typeof orderSchema>;
type OrderStatus = z.output<typeof orderStatusSchema>;
type OrderTimelineEntry = z.output<typeof orderTimelineEntrySchema>;

export const orderTransitionSourceSchema = z.enum(["system", "staff", "webhook", "customer"]);

export type OrderTransitionSource = z.output<typeof orderTransitionSourceSchema>;

const orderLifecycleSequence = ["PENDING_PAYMENT", "PAID", "IN_PREP", "READY", "COMPLETED"] as const;
const terminalOrderStatuses = new Set<OrderStatus>(["COMPLETED", "CANCELED"]);
const orderLifecycleNotes: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Order created from quote",
  PAID: "Payment confirmed.",
  IN_PREP: "Order moved into preparation.",
  READY: "Order is ready for pickup.",
  COMPLETED: "Order completed.",
  CANCELED: "Order canceled."
};

export type OrderLifecycleStepMetadata = {
  occurredAt?: string;
  note?: string;
  source?: OrderTransitionSource;
};

export type OrderLifecycleStepResolver = (input: {
  currentOrder: Order;
  nextStatus: Exclude<OrderStatus, "PENDING_PAYMENT">;
  targetStatus: OrderStatus;
  stepNumber: number;
}) => OrderLifecycleStepMetadata | undefined;

export type OrderLifecycleTransition = {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  timelineEntry: OrderTimelineEntry;
};

export type OrderLifecycleTransitionResult = {
  order: Order;
  changed: boolean;
  appliedTransitions: OrderLifecycleTransition[];
};

export class OrderTransitionError extends Error {
  readonly code = "ORDER_TRANSITION_INVALID";
  readonly statusCode = 409;
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "OrderTransitionError";
    this.details = details;
  }
}

function getLifecycleIndex(status: OrderStatus) {
  return orderLifecycleSequence.findIndex((candidate) => candidate === status);
}

function buildTimelineEntry(input: {
  status: OrderStatus;
  occurredAt?: string;
  note?: string;
  source?: OrderTransitionSource;
}) {
  const parsedSource = input.source ? orderTransitionSourceSchema.parse(input.source) : undefined;

  return orderTimelineEntrySchema.parse({
    status: input.status,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    note: input.note ?? orderLifecycleNotes[input.status],
    ...(parsedSource ? { source: parsedSource } : {})
  });
}

function buildInvalidTransitionError(params: {
  currentStatus: OrderStatus;
  nextStatus: OrderStatus;
}) {
  return new OrderTransitionError("Invalid order transition.", {
    currentStatus: params.currentStatus,
    nextStatus: params.nextStatus
  });
}

export function isTerminalOrderStatus(status: OrderStatus) {
  return terminalOrderStatuses.has(status);
}

export function canTransitionOrderStatus(currentStatus: OrderStatus, nextStatus: OrderStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (isTerminalOrderStatus(currentStatus)) {
    return false;
  }

  if (nextStatus === "CANCELED") {
    return currentStatus !== "CANCELED" && currentStatus !== "COMPLETED";
  }

  const currentIndex = getLifecycleIndex(currentStatus);
  const nextIndex = getLifecycleIndex(nextStatus);
  if (currentIndex === -1 || nextIndex === -1) {
    return false;
  }

  return nextIndex === currentIndex + 1;
}

export function createOrderTimelineEntry(input: {
  status: OrderStatus;
  occurredAt?: string;
  note?: string;
  source?: OrderTransitionSource;
}) {
  return buildTimelineEntry(input);
}

export function transitionOrderStatus(
  order: Order,
  nextStatus: OrderStatus,
  metadata: OrderLifecycleStepMetadata = {}
): OrderLifecycleTransitionResult {
  const parsedNextStatus = orderStatusSchema.parse(nextStatus);

  if (order.status === parsedNextStatus) {
    return {
      order,
      changed: false,
      appliedTransitions: []
    };
  }

  if (!canTransitionOrderStatus(order.status, parsedNextStatus)) {
    throw buildInvalidTransitionError({
      currentStatus: order.status,
      nextStatus: parsedNextStatus
    });
  }

  const timelineEntry = buildTimelineEntry({
    status: parsedNextStatus,
    occurredAt: metadata.occurredAt,
    note: metadata.note,
    source: metadata.source
  });

  const nextOrder = orderSchema.parse({
    ...order,
    status: parsedNextStatus,
    timeline: [...order.timeline, timelineEntry]
  });

  return {
    order: nextOrder,
    changed: true,
    appliedTransitions: [
      {
        fromStatus: order.status,
        toStatus: parsedNextStatus,
        timelineEntry
      }
    ]
  };
}

export function advanceOrderLifecycleToStatus(
  order: Order,
  targetStatus: OrderStatus,
  options: {
    resolveStepMetadata?: OrderLifecycleStepResolver;
    defaultMetadata?: OrderLifecycleStepMetadata;
  } = {}
): OrderLifecycleTransitionResult {
  const parsedTargetStatus = orderStatusSchema.parse(targetStatus);

  if (order.status === parsedTargetStatus) {
    return {
      order,
      changed: false,
      appliedTransitions: []
    };
  }

  if (parsedTargetStatus === "CANCELED") {
    return transitionOrderStatus(order, parsedTargetStatus, options.defaultMetadata ?? {});
  }

  if (isTerminalOrderStatus(order.status)) {
    throw buildInvalidTransitionError({
      currentStatus: order.status,
      nextStatus: parsedTargetStatus
    });
  }

  const currentIndex = getLifecycleIndex(order.status);
  const targetIndex = getLifecycleIndex(parsedTargetStatus);
  if (currentIndex === -1 || targetIndex === -1 || targetIndex <= currentIndex) {
    throw buildInvalidTransitionError({
      currentStatus: order.status,
      nextStatus: parsedTargetStatus
    });
  }

  let nextOrder = order;
  const appliedTransitions: OrderLifecycleTransition[] = [];

  for (let index = currentIndex + 1; index <= targetIndex; index += 1) {
    const nextStatus = orderLifecycleSequence[index];
    if (!nextStatus || nextStatus === "PENDING_PAYMENT") {
      continue;
    }

    const stepMetadata =
      options.resolveStepMetadata?.({
        currentOrder: nextOrder,
        nextStatus,
        targetStatus: parsedTargetStatus,
        stepNumber: appliedTransitions.length + 1
      }) ?? options.defaultMetadata ?? {};

    const transition = transitionOrderStatus(nextOrder, nextStatus, stepMetadata);
    nextOrder = transition.order;
    appliedTransitions.push(...transition.appliedTransitions);
  }

  return {
    order: nextOrder,
    changed: appliedTransitions.length > 0,
    appliedTransitions
  };
}
