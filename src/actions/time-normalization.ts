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

  const utcGuess = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0
  );
  const guessedOffset = offsetMilliseconds(new Date(utcGuess), dateFormatter);
  let timestamp = utcGuess - guessedOffset;
  const correctedOffset = offsetMilliseconds(new Date(timestamp), dateFormatter);

  if (correctedOffset !== guessedOffset) {
    timestamp = utcGuess - correctedOffset;
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
