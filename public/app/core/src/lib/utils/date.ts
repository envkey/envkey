import moment from "moment";

const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const isIso8601 = (str: string) => iso8601Regex.test(str);

/**
 * Convert a friendly human relative time to a date. Assumes past dates.
 *
 *  `1m` = 1 minute ago
 *  `1h` = 1 hour ago
 *  `2d` = 2 days ago
 */
export const dateFromRelativeTime = (
  humanReadableDiffUTC: string,
  relativeToForTesting?: Date
): Date | undefined => {
  if (!humanReadableDiffUTC) return;

  const baseMoment = relativeToForTesting
    ? moment.utc(relativeToForTesting.toISOString())
    : moment.utc();
  const gaveUpDate = () => moment.utc(humanReadableDiffUTC).toDate();
  const beginPeriodIndex = humanReadableDiffUTC.search(/[a-z]/i);
  if (beginPeriodIndex === -1) {
    return gaveUpDate();
  }

  // h, hours, min, minutes, d, days
  const amount = parseFloat(
    humanReadableDiffUTC.substring(0, beginPeriodIndex)
  );
  const period = humanReadableDiffUTC.substring(beginPeriodIndex);

  if (!amount || isNaN(amount) || !period) {
    return gaveUpDate();
  }

  switch (period.toLowerCase()) {
    case "mo":
    case "mon":
    case "month":
    case "months":
      // "m" is minutes
      return baseMoment.subtract(amount, "months").toDate();
    case "d":
    case "day":
    case "days":
      return baseMoment.subtract(amount, "days").toDate();
    case "h":
    case "hr":
    case "hour":
    case "hours":
      return baseMoment.subtract(amount, "hours").toDate();
    case "m":
    case "min":
    case "mins":
    case "minute":
    case "minutes":
      return baseMoment.subtract(amount, "minutes").toDate();
    case "s":
    case "secs":
    case "second":
    case "seconds":
      return baseMoment.subtract(amount, "seconds").toDate();
  }

  return gaveUpDate();
};

export const twitterShortTs = (
  timestamp: string | number,
  nowArg?: number
): string => {
  const dt: number = moment.utc(timestamp).valueOf(),
    now = nowArg ?? Date.now(),
    diff = Math.floor((now - dt) / 1000);

  let includeAgo: boolean = true,
    s: string | undefined;
  if (diff <= 1) {
    s = "just now";
    includeAgo = false;
  } else if (diff < 20) {
    s = diff + "s";
  } else if (diff < 60) {
    s = "less than 1m";
  } else if (diff <= 90) {
    s = "1m";
  } else if (diff <= 3540) {
    s = Math.round(diff / 60) + "m";
    includeAgo = true;
  } else if (diff <= 5400) {
    s = "1h";
  } else if (diff <= 86400) {
    s = Math.round(diff / 3600) + "h";
    includeAgo = true;
  } else if (diff <= 129600) {
    s = "1d";
  } else if (diff < 604800) {
    s = Math.round(diff / 86400) + "d";
    includeAgo = true;
  }

  if (!s) {
    s = moment.utc(timestamp).format("M/D/YY");
    includeAgo = false;
  }

  return s + (includeAgo ? " ago" : "");
};

export const simpleDurationString = (ms: number) => {
  const secondMs = 1000;
  const minuteMs = secondMs * 60;
  const hourMs = minuteMs * 60;
  const dayMs = hourMs * 24;

  // days
  const numDays = Math.floor(ms / dayMs);
  if (numDays > 1) {
    return `${numDays} days`;
  }

  // hours
  const numHours = Math.floor(ms / hourMs);
  if (numHours > 1) {
    return `${numHours} hours`;
  }

  // minutes
  const numMinutes = Math.floor(ms / minuteMs);
  if (numMinutes > 1) {
    return `${numMinutes} minutes`;
  }

  // seconds
  const numSeconds = Math.floor(ms / secondMs);
  if (numSeconds > 1) {
    return `${numSeconds} seconds`;
  }

  // ms
  return `${ms} milliseconds`;
};
