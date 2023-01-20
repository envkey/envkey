import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import * as layout from "../layout";
import { deepMergeStyles, multi } from "../helpers";
import { tertiaryButton } from "../mixins";

export const Integrations = style({
  width: "100%",
  display: "flex",
  flexDirection: "row",
  margin: 0,
  paddingLeft: layout.SUB_SIDEBAR_FILTERS_WIDTH,

  $nest: {},
});
