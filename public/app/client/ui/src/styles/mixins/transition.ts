import { types } from "typestyle";

const DEFAULT_DURATION = "200ms";
const DEFAULT_TIMING_FN = "ease";

export const transition = (
  prop: string,
  duration?: string
): types.NestedCSSProperties => ({
  transitionProperty: prop,
  transitionDuration: duration ?? DEFAULT_DURATION,
  transitionTimingFunction: DEFAULT_TIMING_FN,
});
