import React, { useState } from "react";
import { Component } from "@ui_types";
import { wait } from "@core/lib/utils/wait";
import copyToClipboard from "copy-text-to-clipboard";

export const CopyableDisplay: Component<
  {},
  {
    label: string;
    value: string | undefined;
    className?: string;
  }
> = ({ label, value, className, dispatch }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (value: string) => {
    copyToClipboard(value);

    setCopied(true);
    wait(2000).then(() => setCopied(false));
  };

  const el =
    value && value.length > 60 ? (
      <textarea disabled={true} value={value ?? ""} />
    ) : (
      <input type="text" disabled={true} value={value ?? ""} />
    );

  return (
    <div className={["field", className].filter(Boolean).join(" ")}>
      <label>
        {label}{" "}
        {value ? (
          <button
            className="copy"
            onClick={(e) => {
              e.preventDefault();
              copy(value);
            }}
          >
            Copy
          </button>
        ) : (
          ""
        )}
      </label>

      {copied ? <small className="copied">Copied.</small> : ""}

      {el}
    </div>
  );
};
