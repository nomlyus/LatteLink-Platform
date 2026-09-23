import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToAdminOrderStream, type OperatorSession } from "../src/api";

const session = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "test-operator-token"
} as OperatorSession;

function snapshotStream(orders: unknown[]) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      nextController.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "snapshot", orders })}\n\n`));
    }
  });
  return { response: new Response(body, { status: 200 }), close: () => controller.close() };
}

describe("operator order stream", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reconnects after a network failure and receives an authoritative snapshot", async () => {
    const stream = snapshotStream([]);
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(stream.response);
    vi.stubGlobal("fetch", fetch);
    const onStateChange = vi.fn();
    const onEvent = vi.fn();
    vi.useFakeTimers();

    const unsubscribe = subscribeToAdminOrderStream({ session, locationId: "flagship-01", onStateChange, onEvent });
    await vi.waitFor(() => expect(onStateChange).toHaveBeenCalledWith("reconnecting"));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({ type: "snapshot", orders: [] }));
    expect(onStateChange).toHaveBeenCalledWith("connected");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toContain("locationId=flagship-01");
    unsubscribe();
    stream.close();
  });

  it("stops retrying when the view unsubscribes", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const onStateChange = vi.fn();
    vi.useFakeTimers();

    const unsubscribe = subscribeToAdminOrderStream({ session, locationId: "flagship-01", onStateChange, onEvent: vi.fn() });
    await vi.waitFor(() => expect(onStateChange).toHaveBeenCalledWith("reconnecting"));
    unsubscribe();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
