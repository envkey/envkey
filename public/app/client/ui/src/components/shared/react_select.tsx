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
};

const DropdownIndicator: React.FC = (props: any) => {
  return (
    <components.DropdownIndicator {...props}>
      <SvgImage type="down-caret" />
    </components.DropdownIndicator>
  );
};

const MultiValueRemove: React.FC = (props: any) => {
  return (
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
        border: "none",
        borderRadius: 0,
        boxShadow: props.isFocused
          ? `0px 0px 0px 2px ${colors.LIGHTEST_BLUE}`
          : "none",
        cursor: "text",
        ":hover": {
          border: "none",
          boxShadow: props.isFocused
            ? `0px 0px 0px 2px ${colors.LIGHTEST_BLUE}`
            : "none",
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
        fontSize: "13.5px",
        color: colors.DARK_TEXT,
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
