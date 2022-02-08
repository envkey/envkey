import React from "react";
import { OrgComponent } from "@ui_types";
import { Model } from "@core/types";
import { parseMultiFormat } from "@core/lib/parse";

const EXAMPLE_KEY = "xgv2exQ2JMT3vMFVwTVaXP3M6MGWXw";

export const importerPlaceholder = (
  envParentType: Model.EnvParent["type"],
  environmentName: string
) =>
  `# Paste your ${envParentType}'s ${environmentName} variables here.\n\n# In KEY=VAL format\nSOME_API_KEY=${EXAMPLE_KEY}\n\n# In YAML format\nSOME_API_KEY: ${EXAMPLE_KEY}\n\n# Or in JSON format\n{\n  "SOME_API_KEY":"${EXAMPLE_KEY}"\n}`;

export const EnvImportForm: OrgComponent<
  {},
  {
    envParentType: Model.EnvParent["type"];
    environmentName: string;
    value: string;
    disabled?: true;
    onChange: (
      value: string,
      valid: boolean,
      parsed?: Record<string, string>
    ) => void;
  }
> = (props) => {
  return (
    <div>
      <textarea
        disabled={props.disabled ?? false}
        value={props.value}
        autoFocus={true}
        placeholder={importerPlaceholder(
          props.envParentType,
          props.environmentName
        )}
        onKeyPress={(e) => {
          if (e.key == "Enter") {
            e.stopPropagation();
          }
        }}
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            const parsed = parseMultiFormat(val);
            props.onChange(val, Boolean(parsed), parsed || undefined);
          } else {
            props.onChange(val, false);
          }
        }}
      />
    </div>
  );
};
