import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from "react";
import { OrgComponentProps, EnvManagerComponent } from "@ui_types";
import { Client } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { stripUndefinedRecursive } from "@core/lib/utils/object";
import * as styles from "@styles";
import { getPendingInheritingEnvironmentIds } from "@core/lib/client";

type Option<ValType extends {}> = {
  label: React.ReactNode;
  update: ValType;
  searchText?: string;
};

type Props<ValType extends {}> = {
  onSelect: (update: ValType) => void;
  options: Option<ValType>[];
  initialSelected: ValType;
  defaultSelectFirst?: boolean;
  filter?: (searchText: string) => boolean;
};

export const CellAutocomplete = <ValType extends {}>(
  props: OrgComponentProps<{}, Props<ValType>>
) => {
  let options = props.options;

  if (props.filter) {
    options = options.filter(
      ({ searchText }) => searchText && props.filter!(searchText)
    );
  }

  const [selectedIndex, setSelectedIndex] = useState(
    props.defaultSelectFirst ? 0 : -1
  );

  useLayoutEffect(() => {
    const i = options.findIndex((option) => {
      return R.equals(
        option.update,
        stripUndefinedRecursive(props.initialSelected)
      );
    });

    let selected = i;
    if (selected == -1 && props.defaultSelectFirst) {
      selected = 0;
    }

    setSelectedIndex(selected);
  }, [
    JSON.stringify(options.map(R.prop("update"))),
    JSON.stringify(props.initialSelected),
  ]);

  const onKeydown = useCallback(
    (e: KeyboardEvent) => {
      const isCommit = e.key == "Enter" && !e.shiftKey && selectedIndex > -1;
      const isUp = e.key == "ArrowUp";
      const isDown = e.key == "ArrowDown";

      if (isCommit || isUp || isDown) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (isCommit) {
        props.onSelect(options[selectedIndex].update);
      } else if (isUp) {
        setSelectedIndex(Math.max(-1, selectedIndex - 1));
      } else if (isDown) {
        const i = Math.min(options.length - 1, selectedIndex + 1);
        setSelectedIndex(i);
      }
    },
    [options, selectedIndex]
  );

  useEffect(() => {
    document.documentElement.addEventListener("keydown", onKeydown);
    return () => {
      document.documentElement.removeEventListener("keydown", onKeydown);
    };
  }, [onKeydown]);

  const renderOption = (option: Option<ValType>, i: number) => {
    return (
      <div
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          props.onSelect(option.update);
        }}
        onMouseOver={() => {
          setSelectedIndex(i);
        }}
        className={"option" + (i == selectedIndex ? " selected" : "")}
      >
        {option.label}
      </div>
    );
  };

  return (
    <div className={styles.CellAutocomplete}>{options.map(renderOption)}</div>
  );
};

export const EnvCellAutocomplete: EnvManagerComponent<
  {},
  Omit<Props<Client.Env.EnvWithMetaCell>, "options"> & {
    environmentId: string;
    pendingInheritingEnvironmentIds?: Set<string>;
  }
> = (props) => {
  const options = useMemo(
    () =>
      [
        {
          label: "undefined",
          update: { isUndefined: true },
        },
        {
          label: "empty string",
          update: { isEmpty: true, val: "" },
        },
        ...g.authz
          .getInheritableEnvironments(
            props.core.graph,
            props.ui.loadedAccountId!,
            props.environmentId,
            props.pendingInheritingEnvironmentIds ??
              getPendingInheritingEnvironmentIds(props.core, props)
          )
          .map((inheritableEnvironment) => ({
            label: (
              <span>
                inherits
                <strong>
                  {g.getEnvironmentName(
                    props.core.graph,
                    inheritableEnvironment.id
                  )}
                </strong>
              </span>
            ),
            update: { inheritsEnvironmentId: inheritableEnvironment.id },
          })),
      ] as Option<Client.Env.EnvWithMetaCell>[],

    [
      props.core.graphUpdatedAt,
      props.ui.loadedAccountId!,
      props.environmentId,
      props.core.pendingEnvUpdates.length,
    ]
  );

  return CellAutocomplete<Client.Env.EnvWithMetaCell>({
    ...props,
    options,
    defaultSelectFirst: true,
  });
};
