import type { OperatorOrder } from "./model.js";

const alertableStatuses = new Set<OperatorOrder["status"]>(["PAID", "IN_PREP", "READY"]);

export class NewOrderTracker {
  private scope: string | null = null;
  private alertedOrderIds = new Set<string>();

  observe(scope: string, orders: readonly OperatorOrder[]) {
    const alertableOrders = orders.filter((order) => alertableStatuses.has(order.status));

    if (this.scope !== scope) {
      this.scope = scope;
      this.alertedOrderIds = new Set(alertableOrders.map((order) => order.id));
      return [];
    }

    const newOrders = alertableOrders.filter((order) => !this.alertedOrderIds.has(order.id));
    for (const order of newOrders) {
      this.alertedOrderIds.add(order.id);
    }
    return newOrders;
  }

  reset() {
    this.scope = null;
    this.alertedOrderIds.clear();
  }
}

const newOrderTracker = new NewOrderTracker();
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
    return null;
  }
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function primeNewOrderSound() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume();
  }
}

function playNewOrderSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const startAt = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5);
  gain.connect(context.destination);

  for (const [frequency, offset] of [[880, 0], [1174.66, 0.16]] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    oscillator.connect(gain);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.3);
  }
}

export function alertForNewOrders(scope: string, orders: readonly OperatorOrder[]) {
  if (newOrderTracker.observe(scope, orders).length > 0) {
    playNewOrderSound();
  }
}

export function resetNewOrderAlert() {
  newOrderTracker.reset();
}
