import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import { EnvManagerComponent } from "@ui_types";
import { Client, Model } from "@core/types";
import * as g from "@core/lib/graph";
import { style } from "typestyle";
import * as ui from "@ui";
import { getValDisplay } from "@ui_lib/envs";
import {
  getCurrentUserEntryKeysSet,
  getInheritingEnvironmentIds,
  getRawEnvWithAncestors,
} from "@core/lib/client";

type Props = {
  undefinedPlaceholder?: React.ReactNode;
} & (
  | {
      type: "entry";
      environmentId?: undefined;
    }
  | {
      type: "entryVal";
      canUpdate?: boolean;
      environmentId: string;
    }
);

const entryPlaceholder = "VARIABLE_NAME";

const cursorPositionByCellId: Record<
  string,
  { selectionStart: number; selectionEnd: number }
> = {};

export const EntryFormCell: EnvManagerComponent<{}, Props> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const org = g.getOrg(graph);
  const envParent = graph[props.envParentId] as Model.EnvParent;

  const cellId = props.type == "entry" ? "entry" : props.environmentId;

  const autoCaps = useMemo(() => {
    if (props.type != "entry") {
      return false;
    }
    return envParent.settings.autoCaps ?? org.settings.envs.autoCaps;
  }, [graphUpdatedAt, currentUserId, props.type, props.envParentId]);

  const subEnvEntryAutocompleteOptions = useMemo(() => {
    if (props.type == "entry" && props.isSub && props.parentEnvironmentId) {
      const currentKeysSet = getCurrentUserEntryKeysSet(
        props.core,
        currentUserId,
        props.allEnvironmentIds,
        true
      );

      return Object.keys(
        getRawEnvWithAncestors(
          props.core,
          {
            envParentId: props.envParentId,
            environmentId: props.parentEnvironmentId,
          },
          true
        )
      )
        .filter((k) => !currentKeysSet.has(k))
        .sort()
        .map((entryKey) => ({
          label: entryKey,
          update: { entryKey },
          searchText: entryKey,
        }));
    } else {
      return [];
    }
  }, [
    graphUpdatedAt,
    props.core.pendingEnvUpdates.length,
    props.type,
    props.envParentId,
    props.isSub && props.parentEnvironmentId,
  ]);

  let val: string | undefined,
    inheritsEnvironmentId: string | undefined,
    isEmpty: boolean | undefined,
    isUndefined: boolean | undefined;

  const entryFormState = props.ui.envManager.entryForm;

  if (props.type == "entry") {
    val = entryFormState.entryKey;
  } else if (props.type == "entryVal") {
    const cell: Client.Env.EnvWithMetaCell | undefined =
      entryFormState.vals[props.environmentId];

    if (cell) {
      ({ val, inheritsEnvironmentId, isEmpty, isUndefined } = cell);
    } else {
      isUndefined = true;
    }
  }

  const isEditing =
    (props.type == "entry" && entryFormState.editingEntryKey) ||
    (props.type == "entryVal" &&
      props.environmentId == entryFormState.editingEnvironmentId);

  const canUpdate =
    props.type == "entry" || (props.environmentId && props.canUpdate);

  const showInput = canUpdate && isEditing;
  const showAutocomplete =
    showInput &&
    ((props.type == "entryVal" && !val) ||
      (props.type == "entry" && props.isSub));

  const currentUpdate = {
    val,
    inheritsEnvironmentId,
    isEmpty,
    isUndefined,
  } as Client.Env.EnvWithMetaCell;

  const clickedToEdit = entryFormState.clickedToEdit;

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isMulti =
    props.type == "entryVal" && props.editingMultiline && showInput;

  const [lastCommitted, setLastCommitted] = useState<
    string | Client.Env.EnvWithMetaCell
  >();

  useLayoutEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();

      // ensure smooth toggling between single and multi-line mode while editing
      if (clickedToEdit) {
        inputRef.current.scrollTop = 0;
        props.setEnvManagerState({ clickedToEdit: undefined });

        if (!props.editingMultiline) {
          inputRef.current.select();
        }
      }
    }
  }, [props.envParentId, showInput]);

  // maintain cursor position while moving between
  // single and multi-line mode
  useLayoutEffect(() => {
    if (showInput && inputRef.current && cursorPositionByCellId[cellId]) {
      const { selectionStart, selectionEnd } = cursorPositionByCellId[cellId];
      inputRef.current.setSelectionRange(selectionStart, selectionEnd);
    }
  });

  useLayoutEffect(() => {
    if (
      props.type == "entry" &&
      props.ui.envManager.submittedEntryKey &&
      showInput &&
      inputRef.current
    ) {
      inputRef.current.focus();
    }
  }, [props.ui.envManager.submittedEntryKey]);

  const cancel = () => {
    if (props.type == "entry") {
      props.setEntryFormState({
        editingEntryKey: undefined,
        editingEnvironmentId: undefined,

        entryKey: lastCommitted as string,
      });
    } else if (props.type == "entryVal") {
      props.setEntryFormState({
        editingEntryKey: undefined,
        editingEnvironmentId: undefined,

        vals: {
          ...(entryFormState.vals ?? {}),
          [props.environmentId]: lastCommitted as Client.Env.EnvWithMetaCell,
        },
      });
    }
    delete cursorPositionByCellId[cellId];
  };

  const commit = () => {
    if (props.type == "entry") {
      setLastCommitted(val ?? "");
    } else if (props.type == "entryVal") {
      setLastCommitted(currentUpdate);
    }
    delete cursorPositionByCellId[cellId];
  };

  const clearEditing = () => {
    props.setEntryFormState({
      editingEntryKey: undefined,
      editingEnvironmentId: undefined,
    });
  };

  const setEntry = (inputVal: string) => {
    props.setEntryFormState({ entryKey: inputVal });
  };

  const submitEntry = (inputVal: string) => {
    props.setEntryFormState({
      ...entryFormState,
      entryKey: inputVal,
      editingEntryKey: undefined,
      editingEnvironmentId: undefined,
    });
    delete cursorPositionByCellId[cellId];

    setLastCommitted(inputVal);
  };

  const setEntryVal = (update: Client.Env.EnvWithMetaCell) => {
    if (!props.environmentId) {
      return;
    }
    props.setEntryFormState({
      vals: { ...entryFormState.vals, [props.environmentId]: update },
    });
  };

  const submitEntryVal = (update: Client.Env.EnvWithMetaCell) => {
    if (!props.environmentId) {
      return;
    }

    props.setEntryFormState({
      vals: { ...entryFormState.vals, [props.environmentId]: update },
      editingEntryKey: undefined,
      editingEnvironmentId: undefined,
    });
    delete cursorPositionByCellId[cellId];

    setLastCommitted(update);
  };

  let cellContents: React.ReactNode[] = [];
  let classNames: string[] = ["cell"];

  classNames.push(
    props.type == "entry" || (props.type == "entryVal" && props.canUpdate)
      ? "writable"
      : "not-writable"
  );

  if (showInput) {
    classNames.push("editing");

    const inputProps = {
      ref: inputRef as any,
      spellCheck: false,
      placeholder:
        props.type == "entry"
          ? entryPlaceholder
          : "Insert value or choose below.",
      value: val || "",
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => {
        let inputVal = e.currentTarget.value;
        if (autoCaps) {
          inputVal = inputVal.toUpperCase();
        }
        if (inputVal != val) {
          if (props.type == "entry") {
            setEntry(inputVal);
          } else if (props.type == "entryVal") {
            setEntryVal({
              val: inputVal,
              isUndefined: typeof inputVal == "undefined" ? true : undefined,
              isEmpty: inputVal === "" ? true : undefined,
            } as Client.Env.EnvWithMetaCell);
          }
        }
        if (inputRef.current) {
          const { selectionStart, selectionEnd } = inputRef.current;
          cursorPositionByCellId[cellId] = { selectionStart, selectionEnd };
        }
      },
      onClick: (e: React.MouseEvent) => {
        if (isEditing) {
          e.stopPropagation();
        }
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key == "Enter" && !showAutocomplete && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          commit();
          clearEditing();
        } else if (e.key == "Escape") {
          cancel();
        } else if (inputRef.current) {
          const { selectionStart, selectionEnd } = inputRef.current;
          cursorPositionByCellId[cellId] = {
            selectionStart,
            selectionEnd,
          };
        }
      },
      onBlur: () => {
        if (!showAutocomplete) {
          commit();
        }
      },
    };

    cellContents.push(<textarea {...inputProps} />);

    if (showAutocomplete) {
      classNames.push("autocomplete-open");
      if (props.isSub && props.type == "entry") {
        cellContents.push(
          <ui.CellAutocomplete
            {...props}
            initialSelected={{ entryKey: val }}
            onSelect={({ entryKey }) => submitEntry(entryKey!)}
            options={subEnvEntryAutocompleteOptions}
            filter={(searchText) =>
              !val || searchText.toLowerCase().indexOf(val.toLowerCase()) > -1
            }
          />
        );
      } else if (props.environmentId) {
        cellContents.push(
          <ui.EnvCellAutocomplete
            {...props}
            initialSelected={currentUpdate}
            onSelect={(update) => {
              submitEntryVal(update);
            }}
            pendingInheritingEnvironmentIds={
              props.isSub
                ? new Set<string>()
                : getInheritingEnvironmentIds(props.core, {
                    ...props,
                    newEntryVals: props.ui.envManager.entryForm.vals,
                  })
            }
          />
        );
      }
    }
  } else {
    let display: React.ReactNode;
    const valDisplay = getValDisplay(val ?? "");

    if (props.type == "entry") {
      display = val || (
        <small>{props.undefinedPlaceholder || entryPlaceholder}</small>
      );
    } else if (inheritsEnvironmentId) {
      classNames.push("special");
      classNames.push("inherits");
      display = (
        <span>
          <small>inherits</small>
          <label>
            {g.getEnvironmentName(props.core.graph, inheritsEnvironmentId)}
          </label>
        </span>
      );
    } else if (isUndefined) {
      classNames.push("special");
      classNames.push("undefined");

      const environment = props.core.graph[props.environmentId] as
        | Model.Environment
        | undefined;

      const envName = environment
        ? g
            .getEnvironmentName(props.core.graph, props.environmentId)
            .toLowerCase()
        : "local";

      display = <small>{`Set ${envName} value (optional)`}</small>;
    } else if (isEmpty) {
      classNames.push("special");
      classNames.push("empty");
      display = <small>empty string</small>;
    } else {
      display = <span>{valDisplay}</span>;
    }

    cellContents.push(<span>{display}</span>);
  }

  return (
    <div
      id={[props.environmentId, entryFormState.entryKey]
        .filter(Boolean)
        .join("|")}
      className={
        classNames.join(" ") +
        " " +
        style({
          width:
            props.type == "entry" ? props.entryColWidth : props.valColWidth,
          height: isMulti
            ? props.gridHeight - props.labelRowHeight
            : props.envRowHeight,
        })
      }
      onClick={() => {
        if (!isEditing) {
          props.setEntryFormState({
            editingEntryKey: props.type == "entry" ? true : undefined,
            editingEnvironmentId:
              props.type == "entryVal" ? props.environmentId : undefined,
            clickedToEdit: true,
          });
        }
      }}
    >
      {cellContents}
    </div>
  );
};
