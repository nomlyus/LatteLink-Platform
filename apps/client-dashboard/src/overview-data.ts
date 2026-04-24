import { state } from "./state.js";
import type { OperatorOrder } from "./model.js";
import { formatCompactCount, formatCompactMoney } from "./ui/format.js";

type MetricTrendTone = "positive" | "neutral" | "negative";

function startOfLocalDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function getOrderPlacedAt(order: OperatorOrder) {
  const timestamps = order.timeline
    .map((entry) => Date.parse(entry.occurredAt))
    .filter((value): value is number => Number.isFinite(value));
  return timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
}

function buildMetricTrend(params: {
  current: number;
  previous: number;
  suffix: string;
  formatter?: (value: number) => string;
}): { text: string; tone: MetricTrendTone } {
  const { current, previous, suffix, formatter = formatCompactCount } = params;
  if (current === previous) {
    return { text: `No change ${suffix}`, tone: "neutral" };
  }
  if (previous <= 0) {
    const direction = current > previous ? "↑" : "↓";
    return {
      text: `${direction} ${formatter(Math.abs(current - previous))} ${suffix}`,
      tone: current > previous ? "positive" : "negative"
    };
  }
  const deltaRatio = Math.round((Math.abs(current - previous) / previous) * 100);
  return {
    text: `${current > previous ? "↑" : "↓"} ${deltaRatio}% ${suffix}`,
    tone: current > previous ? "positive" : "negative"
  };
}

export function getOverviewSnapshot() {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);
  const todayStartMs = todayStart.getTime();
  const tomorrowStartMs = tomorrowStart.getTime();
  const yesterdayStartMs = yesterdayStart.getTime();

  const todayOrders = state.orders.filter((order) => {
    const placedAt = getOrderPlacedAt(order);
    return placedAt >= todayStartMs && placedAt < tomorrowStartMs;
  });
  const yesterdayOrders = state.orders.filter((order) => {
    const placedAt = getOrderPlacedAt(order);
    return placedAt >= yesterdayStartMs && placedAt < todayStartMs;
  });
  const todayPaidOrders = todayOrders.filter((order) => order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED");
  const yesterdayPaidOrders = yesterdayOrders.filter(
    (order) => order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED"
  );
  const todayRevenueCents = todayPaidOrders.reduce((total, order) => total + order.total.amountCents, 0);
  const yesterdayRevenueCents = yesterdayPaidOrders.reduce((total, order) => total + order.total.amountCents, 0);
  const todayAverageTicketCents =
    todayPaidOrders.length > 0 ? Math.round(todayRevenueCents / todayPaidOrders.length) : 0;
  const yesterdayAverageTicketCents =
    yesterdayPaidOrders.length > 0 ? Math.round(yesterdayRevenueCents / yesterdayPaidOrders.length) : 0;

  const chartStart = addDays(todayStart, -6);
  const rawChartBars = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(chartStart, index);
    const dayEnd = addDays(dayStart, 1);
    const count = state.orders.filter((order) => {
      const placedAt = getOrderPlacedAt(order);
      return placedAt >= dayStart.getTime() && placedAt < dayEnd.getTime();
    }).length;
    return {
      label: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
      count
    };
  });
  const maxBarCount = Math.max(...rawChartBars.map((bar) => bar.count), 1);

  return {
    chartBars: rawChartBars.map((bar) => ({
      ...bar,
      height: Math.max(18, Math.round((bar.count / maxBarCount) * 100)),
      highlighted: bar.count === maxBarCount && maxBarCount > 0
    })),
    metrics: [
      {
        label: "Today's orders",
        value: formatCompactCount(todayOrders.length),
        trend: buildMetricTrend({
          current: todayOrders.length,
          previous: yesterdayOrders.length,
          suffix: "vs yesterday"
        })
      },
      {
        label: "Revenue",
        value: formatCompactMoney(todayRevenueCents),
        trend: buildMetricTrend({
          current: todayRevenueCents,
          previous: yesterdayRevenueCents,
          suffix: "vs yesterday",
          formatter: formatCompactMoney
        })
      },
      {
        label: "Avg ticket",
        value: formatCompactMoney(todayAverageTicketCents),
        trend: buildMetricTrend({
          current: todayAverageTicketCents,
          previous: yesterdayAverageTicketCents,
          suffix: "vs yesterday",
          formatter: formatCompactMoney
        })
      }
    ]
  };
}
