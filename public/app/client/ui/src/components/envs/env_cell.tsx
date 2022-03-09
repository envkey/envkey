import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  EnvManagerComponentProps,
  EnvManagerComponent,
  EnvManagerState,
} from "@ui_types";
import { Client, Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { style } from "typestyle";
import { layout } from "@styles";
import * as ui from "@ui";
import { stripUndefinedRecursive } from "@core/lib/utils/object";
import { getValDisplay } from "@ui_lib/envs";
import { SvgImage } from "@images";
import * as EntryForm from "./entry_form";
import { isMultiline } from "@core/lib/utils/string";
import copy from "copy-text-to-clipboard";

type Props = {
  entryKey: string;
  canUpdate: boolean;
  undefinedPlaceholder?: React.ReactNode;
  isConnectedBlock?: true;
  connectedBlockEnvironmentIds?: string[];
  pending: boolean;
} & (
  | {
      type: "entry";
      environmentId?: undefined;
    }
  | {
      type: "entryVal";
      environmentId: string;
      cell: Client.Env.UserEnvCell | undefined;
      canRead: boolean;
      canReadMeta: boolean;
    }
);

const CLEARED_EDIT_STATE: Partial<EnvManagerState> = {
  editingEntryKey: undefined,
  editingEnvParentId: undefined,
  editingEnvironmentId: undefined,
  editingInputVal: undefined,
  clickedToEdit: undefined,
};

const maskDots = <span>{"●●●●●●●●●●●"}</span>,
  entryPlaceholder = "VARIABLE_NAME";

const getCellId = (props: EnvManagerComponentProps<{}, Props>) =>
  [props.envParentId, props.entryKey, props.environmentId]
    .filter(Boolean)
    .join("|");

const getIsEditing = (props: EnvManagerComponentProps<{}, Props>) =>
  props.ui.envManager.editingEnvParentId == props.envParentId &&
  props.ui.envManager.editingEntryKey == props.entryKey &&
  ((props.type == "entry" && !props.ui.envManager.editingEnvironmentId) ||
    (props.type == "entryVal" &&
      props.environmentId == props.ui.envManager.editingEnvironmentId));

const memoizeableProps = (props: EnvManagerComponentProps<{}, Props>) => {
  const cellId = getCellId(props);
  const committedVal = props.ui.envManager.committingToCore[cellId];
  const isEditing = getIsEditing(props);

  return [
    props.core.graphUpdatedAt,
    props.ui.loadedAccountId,
    props.envParentId,
    props.type,
    props.editingMultiline,
    cellId,
    "cell" in props && JSON.stringify(props.cell),
    isEditing,
    isEditing && props.ui.envManager.clickedToEdit,
    props.ui.envManager.hideValues,
    Boolean(committedVal),
  ];
};

const cursorPositionByCellId: Record<
  string,
  { selectionStart: number; selectionEnd: number }
> = {};

export const EnvCell: EnvManagerComponent<{}, Props> = React.memo(
  (props) => {
    const { graph, graphUpdatedAt } = props.core;
    const currentUserId = props.ui.loadedAccountId!;
    const org = g.getOrg(graph);
    const envParent = graph[props.envParentId] as Model.EnvParent;

    const inputRef = useRef<HTMLTextAreaElement>(null);

    const [copied, setCopied] = useState(false);
    const [inputVal, _setInputVal] = useState(
      props.ui.envManager.editingInputVal
    );

    useLayoutEffect(() => {
      if (props.ui.envManager.editingInputVal != inputVal) {
        setInputVal(props.ui.envManager.editingInputVal);
      }
    }, [props.ui.envManager.editingInputVal]);

    const setInputVal = (
      val: string | undefined,
      setEnvManagerState?: true
    ) => {
      _setInputVal(val ?? "");
      if (setEnvManagerState) {
        requestAnimationFrame(() => {
          props.setEnvManagerState({ editingInputVal: val });
        });
      }
    };

    const autoCaps = useMemo(() => {
      if (props.type != "entry") {
        return false;
      }

      return envParent.settings.autoCaps ?? org.settings.envs.autoCaps;
    }, [graphUpdatedAt, currentUserId, props.type, props.envParentId]);

    let val: string | undefined,
      inheritsEnvironmentId: string | undefined,
      isEmpty: boolean | undefined,
      isUndefined: boolean | undefined,
      hasMetaVal = false;

    if (props.type == "entry") {
      val = props.entryKey;
    } else if (props.type == "entryVal") {
      if (props.cell) {
        ({ val, inheritsEnvironmentId, isEmpty, isUndefined } = props.cell);
      } else {
        isUndefined = true;
      }

      hasMetaVal =
        !inheritsEnvironmentId &&
        !isEmpty &&
        !isUndefined &&
        typeof val == "undefined";
    }
    const isEditing = getIsEditing(props);
    const current = useMemo(
      () =>
        props.type == "entry"
          ? props.entryKey
          : (stripUndefinedRecursive({
              val,
              isUndefined,
              isEmpty,
              inheritsEnvironmentId,
            }) as Client.Env.EnvWithMetaCell),
      [props.type, val, isUndefined, isEmpty, inheritsEnvironmentId]
    );

    const clickedToEdit = props.ui.envManager.clickedToEdit;
    const cellId = getCellId(props);
    const committingToCore = props.ui.envManager.committingToCore;
    const committedVal = committingToCore[cellId];
    const isCommitting = committedVal && !R.equals(current, committedVal);
    const showInput = props.canUpdate && !isCommitting && isEditing;
    const showAutocomplete = showInput && props.type == "entryVal" && !inputVal;
    const isMulti =
      props.type == "entryVal" &&
      showInput &&
      inputVal &&
      (props.editingMultiline || isMultiline(inputVal, props.valColWidth));

    if (typeof committedVal == "string") {
      val = committedVal;
    } else if (committedVal) {
      ({ val, inheritsEnvironmentId, isEmpty, isUndefined } = committedVal);
    }

    useEffect(() => {
      if (committedVal && R.equals(current, committedVal)) {
        props.setEnvManagerState({
          committingToCore: R.omit([cellId], committingToCore),
        });
      }
    }, [committedVal, current]);

    useLayoutEffect(() => {
      if (showInput && inputRef.current) {
        inputRef.current.focus();

        // ensure smooth toggling between single and multi-line mode while editing
        if (clickedToEdit) {
          // inputRef.current.scrollTop = 0;
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

    const submitEntry = () => {
      if (!inputVal || inputVal === props.entryKey) {
        return;
      }
      if (props.routeParams.subEnvironmentId) {
        props.dispatch({
          type: Client.ActionType.UPDATE_ENTRY,
          payload: {
            envParentId: props.envParentId,
            environmentId: props.routeParams.subEnvironmentId,
            entryKey: props.entryKey,
            newEntryKey: inputVal,
          },
        });
      } else {
        props.dispatch({
          type: Client.ActionType.UPDATE_ENTRY_ROW,
          payload: {
            envParentId: props.envParentId,
            entryKey: props.entryKey,
            newEntryKey: inputVal,
          },
        });
      }

      props.setEnvManagerState({
        ...CLEARED_EDIT_STATE,
        committingToCore: { ...committingToCore, [cellId]: inputVal },
      });
      setInputVal("");
      delete cursorPositionByCellId[cellId];
    };

    const submitEntryVal = (update: Client.Env.EnvWithMetaCell) => {
      if (!props.environmentId) {
        return;
      }

      setInputVal("");
      delete cursorPositionByCellId[cellId];
      props.setEnvManagerState({
        ...CLEARED_EDIT_STATE,
        committingToCore: {
          ...committingToCore,
          [cellId]: stripUndefinedRecursive(update),
        },
      });

      props.dispatch({
        type: Client.ActionType.UPDATE_ENTRY_VAL,
        payload: {
          envParentId: props.envParentId,
          environmentId: props.environmentId,
          entryKey: props.entryKey,
          update,
        },
      });
    };

    const commitInput = () => {
      if (inputVal != val && !showAutocomplete) {
        if (props.type == "entry" && inputVal) {
          submitEntry();
        } else if (props.type == "entryVal") {
          submitEntryVal({
            val: inputVal,
            isEmpty: inputVal === "" ? true : undefined,
            isUndefined: undefined,
          } as Client.Env.EnvWithMetaCell);
        }
      } else if (inputVal == val && !showAutocomplete) {
        props.setEnvManagerState({
          ...CLEARED_EDIT_STATE,
        });
        setInputVal("");
        delete cursorPositionByCellId[cellId];
      }
    };

    const renderCell = () => {
      if (copied) {
        return (
          <div
            id={cellId}
            className={
              "cell copied " +
              style({
                height: isMulti
                  ? props.gridHeight -
                    (props.isConnectedBlock ? layout.ENV_ROW_HEIGHT : 0)
                  : props.envRowHeight,
              })
            }
          >
            <small>Copied.</small>
          </div>
        );
      }

      let cellContents: React.ReactNode[] = [];
      let classNames: string[] = ["cell"];

      classNames.push(props.canUpdate ? "writable" : "not-writable");

      if (props.type == "entryVal") {
        if (props.canRead) {
          classNames.push("readable");
        } else if (props.canReadMeta) {
          classNames.push("meta-readable");
        }
      }

      if (props.pending || committedVal) {
        classNames.push("pending");
      }

      if (showInput) {
        classNames.push("editing");

        const inputProps = {
          ref: inputRef,
          spellCheck: false,
          placeholder:
            props.type == "entry"
              ? entryPlaceholder
              : "Start typing or choose below...",
          value: inputVal || "",
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
          ) => {
            let newVal = e.target.value;
            if (autoCaps) {
              newVal = newVal.toUpperCase();
            }
            setInputVal(newVal, true);

            if (inputRef.current) {
              const { selectionStart, selectionEnd } = inputRef.current;
              cursorPositionByCellId[cellId] = { selectionStart, selectionEnd };
            }
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key == "Enter") {
              if (e.shiftKey && props.type == "entry") {
                e.preventDefault();
              } else if (!e.shiftKey) {
                e.preventDefault();
                commitInput();
              }
            } else if (e.key == "Escape") {
              props.setEnvManagerState(CLEARED_EDIT_STATE);
              setInputVal("");
              delete cursorPositionByCellId[cellId];
            } else if (inputRef.current) {
              const { selectionStart, selectionEnd } = inputRef.current;
              cursorPositionByCellId[cellId] = {
                selectionStart,
                selectionEnd,
              };
            }
          },
          onBlur: () => {
            commitInput();
            delete cursorPositionByCellId[cellId];
          },
          onClick: (e: React.MouseEvent) => {
            if (isEditing) {
              e.stopPropagation();
              if (inputRef.current) {
                const { selectionStart, selectionEnd } = inputRef.current;
                cursorPositionByCellId[cellId] = {
                  selectionStart,
                  selectionEnd,
                };
              }
            }
          },
        };

        cellContents.push(<textarea {...inputProps} />);

        if (showAutocomplete && props.environmentId) {
          classNames.push("autocomplete-open");
          cellContents.push(
            <ui.EnvCellAutocomplete
              {...props}
              initialSelected={
                {
                  val,
                  inheritsEnvironmentId,
                  isUndefined,
                  isEmpty,
                } as Client.Env.EnvWithMetaCell
              }
              onSelect={(update) => {
                submitEntryVal(update);
              }}
            />
          );
        }
      } else {
        let display: React.ReactNode;
        const valDisplay = getValDisplay(val ?? "");

        if (props.type == "entry") {
          display = valDisplay ? (
            <span>{valDisplay}</span>
          ) : (
            <small>{props.undefinedPlaceholder || entryPlaceholder}</small>
          );
        } else if (inheritsEnvironmentId && graph[inheritsEnvironmentId]) {
          classNames.push("special");
          classNames.push("inherits");
          display = (
            <span>
              <small>inherits</small>
              <label>
                {g.getEnvironmentName(graph, inheritsEnvironmentId)}
              </label>
            </span>
          );
        } else if (
          (valDisplay && props.ui.envManager.hideValues) ||
          (!props.canUpdate && hasMetaVal)
        ) {
          classNames.push("masked");
          display = maskDots;
        } else if (valDisplay && !props.ui.envManager.hideValues) {
          display = <span>{valDisplay}</span>;
        } else if (
          isUndefined ||
          (inheritsEnvironmentId && !graph[inheritsEnvironmentId])
        ) {
          classNames.push("special");
          classNames.push("undefined");
          if (props.undefinedPlaceholder) {
            classNames.push("placeholder");
          }

          if (props.environmentId == "") {
            display = <SvgImage type="na" />;
          } else {
            display = (
              <small>{props.undefinedPlaceholder || "undefined"}</small>
            );
          }
        } else if (isEmpty) {
          classNames.push("special");
          classNames.push("empty");
          display = <small>empty string</small>;
        } else {
          display = "";
        }

        cellContents.push(display);
      }

      if (!isEditing && !showAutocomplete && !isUndefined && props.canUpdate) {
        cellContents.push(
          <div
            onClick={(e) => {
              e.stopPropagation();

              if (props.type == "entry") {
                props.setEnvManagerState({
                  ...CLEARED_EDIT_STATE,
                  entryForm: EntryForm.CLEARED_EDIT_STATE,
                  showAddForm: false,
                  confirmingDeleteEntryKeyComposite: [
                    props.envParentId,
                    props.isSub ? props.allEnvironmentIds[0] : undefined,
                    props.entryKey,
                  ]
                    .filter(Boolean)
                    .join("|"),
                });
                setInputVal("");
                delete cursorPositionByCellId[cellId];
              } else {
                submitEntryVal({
                  isUndefined: true,
                });
              }
            }}
            className="remove"
          >
            <SvgImage type="x" />
          </div>
        );
      }

      if (props.type == "entryVal" && !isEditing && !showAutocomplete && val) {
        cellContents.push(
          <div
            onClick={(e) => {
              e.stopPropagation();
              setCopied(true);
              copy(val!);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="copy"
          >
            <SvgImage type="copy" />
          </div>
        );
      }

      return (
        <div
          id={cellId}
          className={
            classNames.join(" ") +
            " " +
            style({
              height: isMulti
                ? props.gridHeight -
                  (props.isConnectedBlock ? layout.ENV_ROW_HEIGHT : 0)
                : props.envRowHeight,
            })
          }
          onClick={() => {
            if (!isEditing && props.canUpdate) {
              setInputVal(val);
              props.setEnvManagerState({
                editingEntryKey: props.entryKey,
                editingEnvParentId: props.envParentId,
                editingEnvironmentId:
                  props.type == "entryVal" ? props.environmentId : undefined,
                editingInputVal: val,
                clickedToEdit: true,
                showAddForm: false,
                confirmingDeleteEntryKeyComposite: undefined,
                entryForm: EntryForm.CLEARED_EDIT_STATE,
              });
            }
          }}
        >
          {cellContents}
        </div>
      );
    };

    return renderCell();
  },
  (prevProps, nextProps) => {
    const prev = memoizeableProps(prevProps);
    const next = memoizeableProps(nextProps);
    const sameResult = R.equals(prev, next);
    return sameResult;
  }
);
