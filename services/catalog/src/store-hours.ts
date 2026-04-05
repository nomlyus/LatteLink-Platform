const defaultStoreTimeZone = "America/Detroit";

const weekdayIndexByLabel = new Map<string, number>([
  ["sun", 0],
  ["sunday", 0],
  ["mon", 1],
  ["monday", 1],
  ["tue", 2],
  ["tues", 2],
  ["tuesday", 2],
  ["wed", 3],
  ["weds", 3],
  ["wednesday", 3],
  ["thu", 4],
  ["thur", 4],
  ["thurs", 4],
  ["thursday", 4],
  ["fri", 5],
  ["friday", 5],
  ["sat", 6],
  ["saturday", 6]
]);

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

type ParsedStoreHours = {
  daySet: Set<number>;
  startMinutes: number;
  endMinutes: number;
};

export type StoreHoursState = {
  isOpen: boolean;
  nextOpenAt: string | null;
};

function resolveStoreTimeZone() {
  return process.env.STORE_TIME_ZONE?.trim() || defaultStoreTimeZone;
}

function parseClockTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!match) {
    return undefined;
  }

  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "0", 10);
  const period = match[3]?.toUpperCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return undefined;
  }

  const normalizedHour = hour % 12;
  return (period === "PM" ? normalizedHour + 12 : normalizedHour) * 60 + minute;
}

function resolveDaySet(dayLabel: string) {
  const normalized = dayLabel.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "daily" || normalized === "every day" || normalized === "everyday") {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }

  if (normalized === "weekdays") {
    return new Set([1, 2, 3, 4, 5]);
  }

  if (normalized === "weekends") {
    return new Set([0, 6]);
  }

  const tokens = normalized.split(/[,\s/]+/).filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  const days = new Set<number>();
  for (const token of tokens) {
    const rangeMatch = token.match(/^([a-z]+)\s*[-–—]\s*([a-z]+)$/i);
    if (rangeMatch) {
      const start = weekdayIndexByLabel.get(rangeMatch[1]?.toLowerCase() ?? "");
      const end = weekdayIndexByLabel.get(rangeMatch[2]?.toLowerCase() ?? "");
      if (start === undefined || end === undefined) {
        return undefined;
      }

      let current = start;
      while (true) {
        days.add(current);
        if (current === end) {
          break;
        }
        current = (current + 1) % 7;
      }
      continue;
    }

    const dayIndex = weekdayIndexByLabel.get(token);
    if (dayIndex === undefined) {
      return undefined;
    }

    days.add(dayIndex);
  }

  return days.size > 0 ? days : undefined;
}

function resolveZonedDateParts(now: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(now);
    const weekdayLabel = parts.find((part) => part.type === "weekday")?.value?.toLowerCase();
    const year = Number.parseInt(parts.find((part) => part.type === "year")?.value ?? "", 10);
    const month = Number.parseInt(parts.find((part) => part.type === "month")?.value ?? "", 10);
    const day = Number.parseInt(parts.find((part) => part.type === "day")?.value ?? "", 10);
    const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "", 10);
    const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "", 10);
    const weekday = weekdayLabel ? weekdayIndexByLabel.get(weekdayLabel) : undefined;

    if (
      weekday === undefined ||
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return undefined;
    }

    return {
      year,
      month,
      day,
      weekday,
      minutes: hour * 60 + minute
    };
  } catch {
    return undefined;
  }
}

function toLocalDateTimeMillis(parts: Pick<ZonedDateParts, "year" | "month" | "day" | "minutes">) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(parts.minutes / 60), parts.minutes % 60);
}

function toDateInTimeZone(parts: Pick<ZonedDateParts, "year" | "month" | "day" | "minutes">, timeZone: string) {
  const desiredLocalMillis = toLocalDateTimeMillis(parts);
  let utcMillis = desiredLocalMillis;

  for (let index = 0; index < 5; index += 1) {
    const actual = resolveZonedDateParts(new Date(utcMillis), timeZone);
    if (!actual) {
      return undefined;
    }

    const actualLocalMillis = toLocalDateTimeMillis(actual);
    const diffMinutes = (desiredLocalMillis - actualLocalMillis) / 60000;
    if (diffMinutes === 0) {
      return new Date(utcMillis);
    }

    utcMillis += diffMinutes * 60000;
  }

  return new Date(utcMillis);
}

function parseStoreHoursText(hoursText: string): ParsedStoreHours | undefined {
  const [dayLabel, timeLabel] = hoursText.split(/\s*·\s*/);
  if (!dayLabel || !timeLabel) {
    return undefined;
  }

  const daySet = resolveDaySet(dayLabel);
  if (!daySet) {
    return undefined;
  }

  const timeParts = timeLabel.split(/\s*[-–—]\s*/).filter(Boolean);
  if (timeParts.length !== 2) {
    return undefined;
  }

  const startMinutes = parseClockTime(timeParts[0] ?? "");
  const endMinutes = parseClockTime(timeParts[1] ?? "");
  if (startMinutes === undefined || endMinutes === undefined) {
    return undefined;
  }

  return {
    daySet,
    startMinutes,
    endMinutes
  };
}

function isOpenForHours(hours: ParsedStoreHours, now: ZonedDateParts) {
  if (hours.startMinutes === hours.endMinutes) {
    return true;
  }

  if (hours.startMinutes < hours.endMinutes) {
    return hours.daySet.has(now.weekday) && now.minutes >= hours.startMinutes && now.minutes < hours.endMinutes;
  }

  const previousWeekday = (now.weekday + 6) % 7;
  return (
    (hours.daySet.has(now.weekday) && now.minutes >= hours.startMinutes) ||
    (hours.daySet.has(previousWeekday) && now.minutes < hours.endMinutes)
  );
}

function buildNextOpenAt(hours: ParsedStoreHours, now: ZonedDateParts, timeZone: string) {
  const nowLocalMillis = toLocalDateTimeMillis(now);

  for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
    const candidateLocalDate = new Date(Date.UTC(now.year, now.month - 1, now.day + dayOffset, 0, 0));
    const candidateWeekday = (now.weekday + dayOffset) % 7;
    if (!hours.daySet.has(candidateWeekday)) {
      continue;
    }

    const candidateLocalMillis = Date.UTC(
      candidateLocalDate.getUTCFullYear(),
      candidateLocalDate.getUTCMonth(),
      candidateLocalDate.getUTCDate(),
      Math.floor(hours.startMinutes / 60),
      hours.startMinutes % 60
    );
    if (candidateLocalMillis <= nowLocalMillis) {
      continue;
    }

    const candidate = toDateInTimeZone(
      {
        year: candidateLocalDate.getUTCFullYear(),
        month: candidateLocalDate.getUTCMonth() + 1,
        day: candidateLocalDate.getUTCDate(),
        minutes: hours.startMinutes
      },
      timeZone
    );
    if (!candidate) {
      continue;
    }

    return candidate.toISOString();
  }

  return null;
}

export function resolveStoreHoursState(hoursText: string, now = new Date(), timeZone = resolveStoreTimeZone()): StoreHoursState {
  const parsed = parseStoreHoursText(hoursText);
  if (!parsed) {
    return {
      isOpen: false,
      nextOpenAt: null
    };
  }

  const zonedNow = resolveZonedDateParts(now, timeZone);
  if (!zonedNow) {
    return {
      isOpen: false,
      nextOpenAt: null
    };
  }

  const isOpen = isOpenForHours(parsed, zonedNow);
  return {
    isOpen,
    nextOpenAt: isOpen ? null : buildNextOpenAt(parsed, zonedNow, timeZone)
  };
}
