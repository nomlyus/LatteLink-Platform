import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function createClient() {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_APP_VARIANT", "local");
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://127.0.0.1:8080/v1");
  vi.stubEnv("EXPO_PUBLIC_BRAND_ID", "stream-test-brand");
  const { apiClient } = await import("../src/api/client");
  apiClient.setAccessToken("test-session-token");
  return apiClient;
}

describe("order transport WHATWG fetch contract (SDK 57 default fetch)", () => {
  it("decodes split stream frames and prevents late delivery after navigation cleanup", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      }
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = await createClient();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const stop = client.subscribeToOrders(onEvent, onError);
    try {
      await vi.waitFor(() => expect(stream.locked).toBe(true));
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/orders/stream?brandId=stream-test-brand",
        expect.objectContaining({
          headers: { Accept: "text/event-stream", Authorization: "Bearer test-session-token" }
        })
      );
      controller.enqueue(new TextEncoder().encode('data: {"type":"snap'));
      controller.enqueue(new TextEncoder().encode('shot","orders":[]}\r\n\r\n'));
      await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({ type: "snapshot", orders: [] }));
      stop();
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
      controller.enqueue(new TextEncoder().encode('data: {"type":"snapshot","orders":[]}\n\n'));
      controller.close();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it("falls back to polling if a valid stream closes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      }
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(stream, { status: 200 }))
      .mockImplementation(() => Promise.resolve(new Response("[]", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const client = await createClient();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const stop = client.subscribeToOrders(onEvent, onError);
    try {
      await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({ type: "snapshot", orders: [] }));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Orders stream closed" }));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
