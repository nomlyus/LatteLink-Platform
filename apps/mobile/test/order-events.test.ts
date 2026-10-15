import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSseEventChunks, readSseEventData, startOrdersPolling } from "../src/api/orderEvents";

afterEach(() => vi.useRealTimers());

describe("order transport lifecycle", () => {
  it("keeps partial SSE frames and joins data lines", () => {
    const first = parseSseEventChunks('data: {"type":\r\ndata: "snapshot"}\r\n\r\ndata: partial');
    expect(readSseEventData(first.completeEvents[0])).toBe('{"type":\n"snapshot"}');
    expect(first.remainder).toBe("data: partial");
    expect(readSseEventData(": heartbeat")).toBeUndefined();
  });

  it("does not overlap polls or emit a response after disposal", async () => {
    vi.useFakeTimers();
    let complete!: (orders: []) => void;
    const listOrders = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          complete = resolve;
        })
    );
    const onEvent = vi.fn();
    const stop = startOrdersPolling({ client: { listOrders }, onEvent });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(listOrders).toHaveBeenCalledTimes(1);
    stop();
    complete([]);
    await Promise.resolve();
    expect(onEvent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(listOrders).toHaveBeenCalledTimes(1);
  });

  it("continues polling after a failed request", async () => {
    vi.useFakeTimers();
    const listOrders = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const onEvent = vi.fn();
    const onError = vi.fn();
    const stop = startOrdersPolling({ client: { listOrders }, onEvent, onError });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "snapshot", orders: [] });
    stop();
  });
});
