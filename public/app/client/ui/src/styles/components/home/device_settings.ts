import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { HomeContainerForm } from "./home_container";

export const DeviceSettings =
  HomeContainerForm +
  " " +
  style({
    $nest: {},
  });
