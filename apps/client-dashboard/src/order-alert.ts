import type { OperatorOrder } from "./model";

const alertableStatuses = new Set<OperatorOrder["status"]>(["PAID", "IN_PREP", "READY"]);
const seenOrdersKeyPrefix = "nomly:seen-order-alerts:";

function readSeenOrderIds(scope: string): Set<string> | null {
  try {
    const raw = window.sessionStorage.getItem(`${seenOrdersKeyPrefix}${scope}`);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? new Set(parsed)
      : null;
  } catch {
    return null;
  }
}

function saveSeenOrderIds(scope: string, ids: Set<string>) {
  try {
    window.sessionStorage.setItem(`${seenOrdersKeyPrefix}${scope}`, JSON.stringify([...ids].slice(-500)));
  } catch {
    // Storage can be disabled; in-memory deduplication still works.
  }
}

export class NewOrderTracker {
  private scope: string | null = null;
  private alertedOrderIds = new Set<string>();

  observe(scope: string, orders: readonly OperatorOrder[]) {
    const alertableOrders = orders.filter((order) => alertableStatuses.has(order.status));

    if (this.scope !== scope) {
      this.scope = scope;
      const previouslySeen = readSeenOrderIds(scope);
      this.alertedOrderIds = previouslySeen ?? new Set(alertableOrders.map((order) => order.id));
      if (previouslySeen === null) {
        saveSeenOrderIds(scope, this.alertedOrderIds);
        return [];
      }
    }

    const newOrders = alertableOrders.filter((order) => !this.alertedOrderIds.has(order.id));
    for (const order of newOrders) {
      this.alertedOrderIds.add(order.id);
    }
    if (newOrders.length > 0) saveSeenOrderIds(scope, this.alertedOrderIds);
    return newOrders;
  }

  reset() {
    this.scope = null;
    this.alertedOrderIds.clear();
  }
}

const newOrderTracker = new NewOrderTracker();
let audioContext: AudioContext | null = null;
let soundEnabled = false;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

function playChime(context: AudioContext) {
  const startAt = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.7);
  gain.connect(context.destination);

  for (const [frequency, offset] of [[880, 0], [1174.66, 0.22]] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    oscillator.connect(gain);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.4);
  }
}

export function isNewOrderSoundEnabled() {
  return soundEnabled && audioContext?.state === "running";
}

export async function enableNewOrderSound() {
  const context = getAudioContext();
  if (!context) {
    soundEnabled = false;
    return false;
  }

  try {
    if (context.state !== "running") {
      await context.resume();
    }
    soundEnabled = context.state === "running";
    if (soundEnabled) {
      playChime(context);
    }
  } catch {
    soundEnabled = false;
  }

  return soundEnabled;
}

export async function resumeNewOrderSound() {
  if (!soundEnabled || !audioContext || audioContext.state === "running") return;
  try {
    await audioContext.resume();
  } catch {
    // The button remains available for another user-initiated attempt.
  }
}

export function alertForNewOrders(scope: string, orders: readonly OperatorOrder[]) {
  if (newOrderTracker.observe(scope, orders).length > 0 && isNewOrderSoundEnabled() && audioContext) {
    playChime(audioContext);
  }
}

export function resetNewOrderAlert() {
  newOrderTracker.reset();
  soundEnabled = false;
}
