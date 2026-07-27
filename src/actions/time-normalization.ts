export interface TaskTimeInput {
  localDate: string;
  explicitDueAt?: string;
}

export interface UserTimeSettings {
  timezone: string;
  defaultReminderTime: string;
}

export type NormalizedTaskTime =
  | {
      ok: true;
      dueAt: string;
      remindAt: string;
    }
  | {
      ok: false;
      reason: string;
    };

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function formatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
  } catch {
    throw new Error(`invalid timezone: ${timezone}`);
  }
}

function partsAt(date: Date, dateFormatter: Intl.DateTimeFormat): LocalDateTimeParts {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function offsetMilliseconds(date: Date, dateFormatter: Intl.DateTimeFormat): number {
  const parts = partsAt(date, dateFormatter);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return representedAsUtc - Math.floor(date.getTime() / 1_000) * 1_000;
}

function localDateTimeToIso(
  localDate: string,
  localTime: string,
  dateFormatter: Intl.DateTimeFormat
): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(localTime);

  if (!dateMatch || !timeMatch) {
    throw new Error("invalid local task time");
  }

  const requested: LocalDateTimeParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0
  };

  if (
    requested.month < 1 ||
    requested.month > 12 ||
    requested.day < 1 ||
    requested.day > 31 ||
    requested.hour < 0 ||
    requested.hour > 23 ||
    requested.minute < 0 ||
    requested.minute > 59
  ) {
    throw new Error("invalid local task time");
  }

  const calendarCheck = new Date(0);
  calendarCheck.setUTCFullYear(requested.year, requested.month - 1, requested.day);
  calendarCheck.setUTCHours(requested.hour, requested.minute, requested.second, 0);

  if (
    calendarCheck.getUTCFullYear() !== requested.year ||
    calendarCheck.getUTCMonth() + 1 !== requested.month ||
    calendarCheck.getUTCDate() !== requested.day ||
    calendarCheck.getUTCHours() !== requested.hour ||
    calendarCheck.getUTCMinutes() !== requested.minute
  ) {
    throw new Error("invalid local task time");
  }

  const utcGuess = calendarCheck.getTime();
  const oneDay = 24 * 60 * 60 * 1_000;
  const offsets = new Set<number>();
  const collectOffset = (timestamp: number) => {
    offsets.add(offsetMilliseconds(new Date(timestamp), dateFormatter));
  };

  collectOffset(utcGuess - oneDay);
  collectOffset(utcGuess);
  collectOffset(utcGuess + oneDay);

  for (const offset of [...offsets]) {
    const provisionalTimestamp = utcGuess - offset;
    collectOffset(provisionalTimestamp - oneDay);
    collectOffset(provisionalTimestamp);
    collectOffset(provisionalTimestamp + oneDay);
  }

  const validCandidates = [...offsets]
    .map((offset) => utcGuess - offset)
    .filter((timestamp) => {
      const converted = partsAt(new Date(timestamp), dateFormatter);
      return (
        converted.year === requested.year &&
        converted.month === requested.month &&
        converted.day === requested.day &&
        converted.hour === requested.hour &&
        converted.minute === requested.minute &&
        converted.second === requested.second
      );
    })
    .sort((left, right) => left - right);

  const timestamp = validCandidates[0];
  if (timestamp === undefined) {
    throw new Error("invalid local task time");
  }

  return new Date(timestamp).toISOString();
}

function localDateAt(date: Date, dateFormatter: Intl.DateTimeFormat): string {
  const parts = partsAt(date, dateFormatter);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

export function normalizeTaskTime(
  input: TaskTimeInput,
  settings: UserTimeSettings,
  now: Date
): NormalizedTaskTime {
  const dateFormatter = formatter(settings.timezone);

  if (input.explicitDueAt !== undefined) {
    const explicitDate = new Date(input.explicitDueAt);
    if (Number.isNaN(explicitDate.getTime())) {
      throw new Error("invalid explicit task time");
    }

    if (localDateAt(explicitDate, dateFormatter) !== input.localDate) {
      return {
        ok: false,
        reason: "explicit task time does not match local date"
      };
    }

    if (explicitDate.getTime() <= now.getTime()) {
      return {
        ok: false,
        reason: "explicit task time is in the past"
      };
    }

    const explicitIso = explicitDate.toISOString();
    return {
      ok: true,
      dueAt: explicitIso,
      remindAt: explicitIso
    };
  }

  let dueAt = localDateTimeToIso(
    input.localDate,
    settings.defaultReminderTime,
    dateFormatter
  );

  if (
    input.localDate === localDateAt(now, dateFormatter) &&
    new Date(dueAt).getTime() <= now.getTime()
  ) {
    dueAt = new Date(now.getTime() + 60 * 60 * 1_000).toISOString();
  }

  return {
    ok: true,
    dueAt,
    remindAt: dueAt
  };
}
