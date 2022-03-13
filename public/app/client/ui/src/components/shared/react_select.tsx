import React from "react";
import { ReactSelectOption } from "@ui_types";
import {
  default as Select,
  Props as SelectProps,
  components,
} from "react-select";
import {
  default as Creatable,
  Props as CreatableProps,
} from "react-select/creatable";
import { style } from "typestyle";
import { SvgImage } from "@images";
import { colors } from "@styles";

type Props = (
  | ({ creatable?: undefined } & SelectProps<ReactSelectOption>)
  | ({
      creatable?: true;
    } & CreatableProps<ReactSelectOption>)
) & {
  hideIndicatorContainer?: boolean;
  bgStyle?: "dark" | "light";
  noBorder?: true;
  noBg?: true;
};

const DropdownIndicator: React.FC = (props: any) => {
  return (
    <components.DropdownIndicator {...props}>
      <SvgImage type="down-caret" />
    </components.DropdownIndicator>
  );
};

const MultiValueRemove: React.FC = (props: any) => {
  return props.data.isFixed ? (
    <span style={{ width: 5 }}> </span>
  ) : (
    <components.MultiValueRemove {...props}>
      <SvgImage type="x" />
    </components.MultiValueRemove>
  );
};

const ClearIndicator: React.FC = (props: any) => {
  return (
    <components.ClearIndicator {...props}>
      <SvgImage type="x" />
    </components.ClearIndicator>
  );
};

export const ReactSelect: React.FC<Props> = (props) => {
  const bgStyle = props.bgStyle ?? "dark";
  const noBg = props.noBg;
  const noBorder = props.noBorder;

  const highlightColor =
    props.bgStyle == "dark" ? colors.LIGHTEST_BLUE : colors.LIGHT_ORANGE;

  const selectProps = {
    ...props,
    components: {
      DropdownIndicator: props.hideIndicatorContainer
        ? null
        : DropdownIndicator,
      MultiValueRemove,
      ClearIndicator: props.hideIndicatorContainer ? null : ClearIndicator,
    },
    styles: {
      control: (base, props) => ({
        ...base,
        border:
          noBorder || bgStyle == "dark" || props.isFocused
            ? "1px solid transparent"
            : "1px solid rgba(0,0,0,0.15)",
        borderRadius: 0,
        boxShadow: props.isFocused
          ? `0px 0px 0px 2px ${highlightColor}`
          : "none",
        cursor: "text",
        ...(noBg
          ? {
              background: "none",
            }
          : {}),
        ":hover": {
          boxShadow: props.isFocused
            ? `0px 0px 0px 2px ${highlightColor}`
            : "none",
          ...(props.isFocused
            ? {
                border: "1px solid transparent",
              }
            : {}),
        },
      }),
      input: (base, props) => ({
        ...base,
        padding: 0,
        margin: 0,
        paddingLeft: 3,
        position: "relative",
        top: 7,
      }),
      placeholder: (base, props) => ({
        ...base,
        fontSize: "14px",
        color: "rgba(0,0,0,0.5)",
      }),
      menu: (base, props) => ({
        ...base,
        marginTop: 2,
        borderRadius: 0,
        border: "1px solid rgba(0,0,0,0.1)",
        fontSize: "13.5px",
        cursor: "pointer",
      }),

      multiValueRemove: (base, props) => ({
        ...base,
        cursor: "pointer",
        ":hover": {
          background: "rgba(0,0,0,0.1)",
          "svg.x": {
            fill: "rgba(0,0,0,0.4)",
          },
        },
      }),

      clearIndicator: (base, props) => ({
        ...base,
        cursor: "pointer",
        "svg.x": {
          margin: "0 3px",
        },
        ":hover svg.x": {
          fill: "rgba(0,0,0,0.4)",
        },
      }),

      dropdownIndicator: (base, props) => ({
        ...base,
        cursor: "pointer",
        ":hover svg.down-caret": {
          fill: "rgba(0,0,0,0.4)",
        },
      }),

      valueContainer: noBg
        ? (base, props) => ({
            ...base,
            padding: 0,
          })
        : undefined,
    } as Props["styles"],
    className:
      "react-select " +
      style({
        $nest: {
          "svg.down-caret": {
            width: 10,
            height: 10,
            fill: "rgba(0,0,0,0.2)",
            pointerEvents: "none",
            margin: "0 7px",
          },
          "svg.x": {
            width: 10,
            height: 10,
            fill: "rgba(0,0,0,0.2)",
            margin: "0 4px",
          },
          "&.react-select input:focus": {
            outline: "none",
            boxShadow: "none",
            border: "none",
          },
        },
      }),
  };

  return props.creatable ? (
    <Creatable {...selectProps} />
  ) : (
    <Select {...selectProps} />
  );
};
