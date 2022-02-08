import React, { FC } from "react";
import { style } from "typestyle";

export const MultilineCopy: FC<{
  width: number;
  left: number;
  top: number;
}> = (props) => {
  return (
    <div className={"multiline-copy " + style(props)}>
      <h4>Multi-line Edit Mode ⟶</h4>

      <h6>
        <em>Esc</em> to cancel
      </h6>
      <h6>
        <em>Enter</em> to commit
      </h6>
      <h6>
        <em>Shift</em> + <em>Enter</em> for line break
      </h6>
    </div>
  );
};
