import React from "react";
import ReactDOM from "react-dom";
import { normalize, setupPage } from "csstips";
import Root from "./components/root";
import * as styles from "@styles";
import { style } from "typestyle";

normalize();
setupPage("#root");

ReactDOM.render(
  <div className={style({ width: "100%", height: "100%" })}>
    <styles.FontFaces />
    <styles.BaseStyles />
    <styles.VendorStyles />
    <Root />
  </div>,

  document.getElementById("root")
);
