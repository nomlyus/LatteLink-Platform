export function createDiscountsRequestLifecycle() {
  let currentRequest: { id: number; controller: AbortController } | null = null;
  let nextRequestId = 0;
  return {
    begin() {
      currentRequest?.controller.abort();
      const request = { id: ++nextRequestId, controller: new AbortController() };
      currentRequest = request;
      return request;
    },
    isCurrent(request: { id: number; controller: AbortController }) {
      return currentRequest === request && !request.controller.signal.aborted;
    },
    finish(request: { id: number; controller: AbortController }) {
      if (currentRequest === request) currentRequest = null;
    },
    invalidate() {
      currentRequest?.controller.abort();
      currentRequest = null;
    }
  };
}

export function createDiscountMutationGate() {
  let active = false;
  return {
    begin() {
      if (active) return false;
      active = true;
      return true;
    },
    release() {
      active = false;
    }
  };
}

export function getDiscountsScopeKey(operatorUserId: string | null, locationId: string | "all" | null) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}`;
}
