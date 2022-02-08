import { types } from "typestyle";
import { multi as _multi } from "style-helper";
import * as R from "ramda";

export const deepMergeStyles = (
  ...cssProps: types.NestedCSSProperties[]
): types.NestedCSSProperties => cssProps.reduce(R.mergeDeepRight, {});

export const multi = (selectors: string[], style: types.NestedCSSProperties) =>
  _multi(selectors, style as any) as types.NestedCSSSelectors;
