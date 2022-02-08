import { style } from "typestyle";
import * as colors from "../../colors";

export const SidebarContainer = style({
  background: colors.DARK_BG_LEFT_TO_RIGHT_GRADIENT,
  height: "calc(100% + 1px)",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  borderRight: "1px solid rgba(255,255,255,0.1)",
});
