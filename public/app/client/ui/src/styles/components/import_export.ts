import { multi } from "./../helpers";
import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { Modal } from "./modal";
import { OrgContainer } from "./org_container";

export const NewEnvParentImporter = style({
  width: "100%",
  $nest: {
    "> div": {
      width: "100%",
    },
    textarea: {
      width: "100%",
      height: 300,
      marginBottom: 30,
    },
    ".tabs": {
      display: "flex",
      alignItems: "center",
    },
    ".tabs > span": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      height: 50,
      fontFamily: fonts.CONDENSED,
      textTransform: "uppercase",
      color: "rgba(0,0,0,0.5)",
      borderTop: "1px solid rgba(0,0,0,0.2)",
      borderLeft: "1px solid rgba(0,0,0,0.2)",
      cursor: "pointer",
      $nest: {
        "&:last-of-type": {
          borderRight: "1px solid rgba(0,0,0,0.2)",
        },
        "&.selected": {
          background: "rgba(0,0,0,0.03)",
          color: colors.DARKER_BLUE,
        },
        "&:not(.selected):hover": {
          background: "rgba(0,0,0,0.015)",
        },
        "> span": {
          color: colors.DARKER_BLUE,
          marginLeft: 10,
        },
      },
    },
  },
});

export const EnvImporter =
  OrgContainer +
  " " +
  Modal +
  " " +
  style({
    $nest: {
      textarea: {
        height: 350,
        marginBottom: 20,
      },
    },
  });

export const EnvExporter =
  OrgContainer +
  " " +
  Modal +
  " " +
  style({
    $nest: multi([".modal", ".field", ".buttons"], {
      minWidth: 560,
    }),
  });
