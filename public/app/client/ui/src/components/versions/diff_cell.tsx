import React from "react";
import { OrgComponent } from "@ui_types";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";

const getValDisplay = (val: string) =>
  val.split(/\n/).join("\\n").split(/\r/).join("\\r");

export const DiffCell: OrgComponent<
  {},
  {
    cell: Client.Env.EnvWithMetaCell | undefined;
    strikethrough?: true;
  }
> = (props) => {
  const {
    cell,
    strikethrough,
    core: { graph },
  } = props;

  let val: string | undefined,
    inheritsEnvironmentId: string | undefined,
    isEmpty: boolean | undefined,
    isUndefined: boolean | undefined,
    notSet: boolean | undefined;

  if (cell) {
    ({ val, inheritsEnvironmentId, isEmpty, isUndefined } = cell);
  } else {
    notSet = true;
  }

  let contents: React.ReactNode[] = [];
  let classNames: string[] = [];

  let display: React.ReactNode;
  const valDisplay = getValDisplay(val ?? "");

  if (inheritsEnvironmentId && graph[inheritsEnvironmentId]) {
    classNames.push("special");
    classNames.push("inherits");
    display = (
      <span>
        <small>inherits</small>
        <label>{g.getEnvironmentName(graph, inheritsEnvironmentId)}</label>
      </span>
    );
  } else if (valDisplay) {
    display = <span>{valDisplay}</span>;
  } else if (
    isUndefined ||
    notSet ||
    (inheritsEnvironmentId && !graph[inheritsEnvironmentId])
  ) {
    classNames.push("special");
    classNames.push("undefined");

    display = <small>{notSet ? "not set" : "undefined"}</small>;
  } else if (isEmpty) {
    classNames.push("special");
    classNames.push("empty");
    display = <small>empty string</small>;
  } else {
    display = "";
  }

  contents.push(display);

  if (strikethrough) {
    contents.push(<small className="strikethrough" />);
  }

  return <span className={classNames.join(" ")}>{contents}</span>;
};
