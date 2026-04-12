import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { menuResponseSchema } from "@lattelink/contracts-catalog";
import { z } from "zod";

export type MenuSyncConfig = {
  sourceUrl: string;
  intervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  locationId: string;
  deadLetterPath: string;
};

export type MenuSyncResult = {
  categoryCount: number;
  itemCount: number;
  attempts: number;
};

export type MenuSyncDeadLetterRecord = {
  occurredAt: string;
  sourceUrl: string;
  locationId: string;
  attempts: number;
  error: string;
};

type Logger = Pick<Console, "info" | "warn" | "error">;

type FetchMenuResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type MenuPayload = z.output<typeof menuResponseSchema>;

export type MenuSyncRuntime = {
  fetchMenu: (url: string) => Promise<FetchMenuResponse>;
  persistMenu: (menu: MenuPayload) => Promise<void>;
  writeDeadLetter: (record: MenuSyncDeadLetterRecord) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  logger: Logger;
  setTimeoutFn: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void;
};

export type MenuSyncLoopHandle = {
  stop: () => void;
};

const DEFAULT_INTERVAL_MS = 300_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const DEFAULT_LOCATION_ID = "flagship-01";
const DEFAULT_DEAD_LETTER_PATH = "./dead-letter/menu-sync.jsonl";
const DEFAULT_SOURCE_URL = "https://webapp.gazellecoffee.com/api/content/public";

function parseIntegerEnv(input: {
  name: string;
  value: string | undefined;
  fallback: number;
  min: number;
}): number {
  const { name, value, fallback, min } = input;
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }

  return parsed;
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : "Unknown menu sync error");
}

function countMenuItems(menu: MenuPayload): number {
  return menu.categories.reduce((total, category) => total + category.items.length, 0);
}

function extractCategories(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const menu = (payload as { menu?: unknown }).menu;
  if (!menu || typeof menu !== "object") {
    return [];
  }

  const categories = (menu as { categories?: unknown }).categories;
  return categories ?? [];
}

export function buildMenuSyncConfig(env: NodeJS.ProcessEnv = process.env): MenuSyncConfig {
  const sourceUrl = env.WEBAPP_MENU_SOURCE_URL ?? DEFAULT_SOURCE_URL;
  const locationId = env.MENU_SYNC_LOCATION_ID ?? DEFAULT_LOCATION_ID;
  const deadLetterPath = env.MENU_SYNC_DEAD_LETTER_PATH ?? DEFAULT_DEAD_LETTER_PATH;

  new URL(sourceUrl);

  return {
    sourceUrl,
    locationId,
    deadLetterPath,
    intervalMs: parseIntegerEnv({
      name: "MENU_SYNC_INTERVAL_MS",
      value: env.MENU_SYNC_INTERVAL_MS,
      fallback: DEFAULT_INTERVAL_MS,
      min: 1
    }),
    maxRetries: parseIntegerEnv({
      name: "MENU_SYNC_MAX_RETRIES",
      value: env.MENU_SYNC_MAX_RETRIES,
      fallback: DEFAULT_MAX_RETRIES,
      min: 0
    }),
    retryDelayMs: parseIntegerEnv({
      name: "MENU_SYNC_RETRY_DELAY_MS",
      value: env.MENU_SYNC_RETRY_DELAY_MS,
      fallback: DEFAULT_RETRY_DELAY_MS,
      min: 1
    })
  };
}

export async function appendDeadLetterRecord(path: string, record: MenuSyncDeadLetterRecord) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await appendFile(absolutePath, `${JSON.stringify(record)}\n`, "utf8");
}

export function createMenuSyncRuntime(config: MenuSyncConfig, logger: Logger = console): MenuSyncRuntime {
  return {
    fetchMenu: async (url) => fetch(url),
    persistMenu: async (menu) => {
      const itemCount = countMenuItems(menu);
      logger.info(`[menu-sync] staged payload (${menu.categories.length} categories, ${itemCount} items)`);
    },
    writeDeadLetter: async (record) => appendDeadLetterRecord(config.deadLetterPath, record),
    sleep: async (delayMs) =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      }),
    now: () => new Date(),
    logger,
    setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => clearTimeout(handle)
  };
}

export async function syncMenuOnce(config: MenuSyncConfig, runtime: Pick<MenuSyncRuntime, "fetchMenu" | "persistMenu">) {
  const response = await runtime.fetchMenu(config.sourceUrl);

  if (!response.ok) {
    throw new Error(`Menu source responded with ${response.status}`);
  }

  const payload = await response.json();
  const parsed = menuResponseSchema.safeParse({
    locationId: config.locationId,
    currency: "USD",
    categories: extractCategories(payload)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }

  await runtime.persistMenu(parsed.data);

  return {
    categoryCount: parsed.data.categories.length,
    itemCount: countMenuItems(parsed.data)
  };
}

export async function syncMenuWithRetry(config: MenuSyncConfig, runtime: MenuSyncRuntime): Promise<MenuSyncResult> {
  const maxAttempts = config.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await syncMenuOnce(config, runtime);
      runtime.logger.info(
        `[menu-sync] sync succeeded (attempt ${attempt}/${maxAttempts}, ${result.categoryCount} categories, ${result.itemCount} items)`
      );

      return {
        ...result,
        attempts: attempt
      };
    } catch (error) {
      const normalizedError = toError(error);
      if (attempt < maxAttempts) {
        const retryDelayMs = config.retryDelayMs * 2 ** (attempt - 1);
        runtime.logger.warn(
          `[menu-sync] sync failed on attempt ${attempt}/${maxAttempts}; retrying in ${retryDelayMs}ms (${normalizedError.message})`
        );
        await runtime.sleep(retryDelayMs);
        continue;
      }

      const deadLetterRecord: MenuSyncDeadLetterRecord = {
        occurredAt: runtime.now().toISOString(),
        sourceUrl: config.sourceUrl,
        locationId: config.locationId,
        attempts: attempt,
        error: normalizedError.message
      };

      await runtime.writeDeadLetter(deadLetterRecord);
      runtime.logger.error(
        `[menu-sync] sync failed after ${attempt}/${maxAttempts} attempts; dead-lettered to ${config.deadLetterPath}`
      );

      throw normalizedError;
    }
  }

  throw new Error("Menu sync exhausted attempts without terminal result");
}

export function startMenuSyncLoop(input: {
  intervalMs: number;
  runCycle: () => Promise<void>;
  setTimeoutFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}): MenuSyncLoopHandle {
  const setTimeoutFn = input.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimeoutFn = input.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const executeCycle = async () => {
    if (stopped) {
      return;
    }

    await input.runCycle();

    if (stopped) {
      return;
    }

    timer = setTimeoutFn(() => {
      void executeCycle();
    }, input.intervalMs);
  };

  void executeCycle();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeoutFn(timer);
      }
    }
  };
}

export function startMenuSyncWorker(config: MenuSyncConfig, runtime: MenuSyncRuntime): MenuSyncLoopHandle {
  return startMenuSyncLoop({
    intervalMs: config.intervalMs,
    runCycle: async () => {
      await syncMenuWithRetry(config, runtime).catch((error) => {
        runtime.logger.error("[menu-sync] terminal sync failure", toError(error));
      });
    },
    setTimeoutFn: runtime.setTimeoutFn,
    clearTimeoutFn: runtime.clearTimeoutFn
  });
}
