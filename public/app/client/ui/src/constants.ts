import moment from "moment";
import "moment-timezone";

export const MIN_ACTION_DELAY_MS = 700;

const TZ_NAME = moment.tz.guess();
export const TZ_ABBREV = moment.tz(TZ_NAME).zoneAbbr();
