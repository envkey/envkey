import React, { useEffect, useLayoutEffect, useState } from "react";
import { EnvManagerComponent } from "@ui_types";
import { Api, Model, Rbac } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import { getEnvParentPath } from "@ui_lib/paths";
import { style } from "typestyle";
import * as styles from "@styles";
import { SvgImage } from "@images";
import { Link } from "react-router-dom";
import { logAndAlertError } from "@ui_lib/errors";

export const SubEnvs: EnvManagerComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const parentEnvironmentId = props.parentEnvironmentId!;
  const parentEnvironment = graph[parentEnvironmentId] as Model.Environment;
  const environmentRole = graph[
    parentEnvironment.environmentRoleId
  ] as Rbac.EnvironmentRole;
  const envParent = graph[props.envParentId] as Model.EnvParent;
  const envParentPath = getEnvParentPath(envParent);
  const subEnvironments =
    g.getSubEnvironmentsByParentEnvironmentId(graph)[parentEnvironmentId] ?? [];
  const searchParams = new URLSearchParams(props.location.search);

  const selectedNew = props.routeParams.subEnvironmentId == "new";

  let subEnvironmentId = selectedNew
    ? undefined
    : props.routeParams.subEnvironmentId;

  let localsUserId: string | undefined;
  if (environmentRole.hasLocalKeys && subEnvironmentId) {
    const subEnvironment = graph[subEnvironmentId] as
      | Model.Environment
      | undefined;
    if (!subEnvironment) {
      const split = subEnvironmentId.split("|");
      localsUserId = split[1];
      subEnvironmentId = undefined;
    }
  }

  useLayoutEffect(() => {
    if (!(selectedNew || subEnvironmentId || localsUserId)) {
      if (environmentRole.hasLocalKeys) {
        pushSubEnvRoute([props.envParentId, currentUserId].join("|"));
      } else if (subEnvironments.length > 0) {
        pushSubEnvRoute(subEnvironments[0].id);
      } else if (canCreate) {
        pushNewRoute();
      } else {
        props.history.push(
          props.orgRoute(`${envParentPath}/${parentEnvironmentId}`)
        );
      }
    }
  }, [graphUpdatedAt, selectedNew, subEnvironmentId]);

  useLayoutEffect(() => {
    if (subEnvironmentId && !localsUserId && !graph[subEnvironmentId]) {
      pushSubEnvBaseRoute();
    }
  }, [graphUpdatedAt, subEnvironmentId]);

  useEffect(() => {
    if (selectedNew && props.ui.envManager.showAddForm) {
      props.setEnvManagerState({ showAddForm: false });
    }
  }, [selectedNew]);

  const canCreate = g.authz.canCreateSubEnvironment(
    graph,
    currentUserId,
    parentEnvironmentId
  );

  const listWidth = props.subEnvsListWidth;
  const selectedWidth = props.viewWidth - listWidth;

  const subEnvBasePath = `${envParentPath}/environments/${parentEnvironmentId}/sub-environments`;

  const pushSubEnvBaseRoute = () =>
    props.history.push(props.orgRoute(subEnvBasePath));

  const pushNewRoute = () =>
    props.history.push(props.orgRoute(`${subEnvBasePath}/new`));

  const pushSubEnvRoute = (id: string) =>
    props.history.push(props.orgRoute(`${subEnvBasePath}/${id}`));

  const [newSubName, setNewSubName] = useState("");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const [hasSubmitError, setHasSubmitError] = useState(false);
  const [createdId, setCreatedId] = useState<string>();

  const createdEnvironment = createdId
    ? (graph[createdId] as Model.Environment | undefined)
    : undefined;

  useLayoutEffect(() => {
    if (createdEnvironment) {
      props.history.push(
        props.orgRoute(
          `${envParentPath}/environments/${parentEnvironmentId}/sub-environments/${createdEnvironment.id}`
        )
      );
      setCreatedId(undefined);
      setNewSubName("");
      setIsSubmittingNew(false);
      setHasSubmitError(false);
    }
  }, [Boolean(createdEnvironment)]);

  useEffect(() => {
    setNewSubName("");
    setIsSubmittingNew(false);
    setHasSubmitError(false);
  }, [parentEnvironmentId]);

  const onSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName) {
      return;
    }
    setIsSubmittingNew(true);
    const res = await props
      .dispatch({
        type: Api.ActionType.CREATE_ENVIRONMENT,
        payload: {
          envParentId: props.envParentId,
          environmentRoleId: parentEnvironment.environmentRoleId,
          isSub: true,
          parentEnvironmentId,
          subName: newSubName,
        },
      })
      .then((res) => {
        if (!res.success) {
          logAndAlertError(
            `There was a problem creating the environment.`,
            (res.resultAction as any).payload
          );
        }
        return res;
      });
    if (res.success) {
      const created = g
        .graphTypes(res.state.graph)
        .environments.find(
          ({ createdAt }) => createdAt === res.state.graphUpdatedAt
        );
      if (created) {
        setCreatedId(created.id);
      }
    } else {
      setHasSubmitError(true);
    }
  };

  const onDeleteSub = async () => {
    const subEnvironment = graph[subEnvironmentId!] as Model.Environment;
    if (!subEnvironment.isSub) {
      return;
    }
    const parentEnvironment = graph[
      subEnvironment.parentEnvironmentId
    ] as Model.Environment;

    if (
      confirm(
        `Are you sure you want to delete ${g.getEnvironmentName(
          graph,
          parentEnvironment.id
        )} > ${subEnvironment.subName}?`
      )
    ) {
      props
        .dispatch({
          type: Api.ActionType.DELETE_ENVIRONMENT,
          payload: { id: subEnvironmentId! },
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem deleting the environment.`,
              (res.resultAction as any).payload
            );
          }
        });
    }
  };

  const renderBackLink = () => {
    if (props.routeParams.environmentId) {
      const backPath = searchParams.get("backPath");
      return (
        <Link
          className={styles.EnvLabelArrowButton + " has-tooltip"}
          to={
            backPath
              ? decodeURIComponent(backPath)
              : props.orgRoute(envParentPath + `/environments`)
          }
        >
          {"←"}
          <span className="tooltip">Go back</span>
        </Link>
      );
    }
  };

  const renderNewListItem = () => (
    <li
      className={
        "sub-label" +
        (selectedNew ? " selected " : " ") +
        style({
          width: listWidth,
        })
      }
      key="sub-label"
    >
      {renderBackLink()}
      {g.getEnvironmentName(graph, parentEnvironment.id)}
      {canCreate ? (
        <div className="actions">
          <span className="add has-tooltip" onClick={() => pushNewRoute()}>
            <SvgImage type="add" />
            {selectedNew ? "" : <span className="tooltip">Add a branch</span>}
          </span>
        </div>
      ) : (
        <div className="actions">
          <span className="add" style={{ visibility: "hidden" }}></span>
        </div>
      )}
    </li>
  );

  const renderDeleteSubEnv = (subEnvironment: Model.Environment) => {
    if (!subEnvironment.isSub) {
      return "";
    }

    return g
      .getEnvironmentPermissions(
        graph,
        subEnvironment.parentEnvironmentId,
        currentUserId
      )
      .has("write_branches") ? (
      <span onClick={onDeleteSub} className="remove">
        <SvgImage type="x" />
      </span>
    ) : (
      ""
    );
  };

  const renderSubEnvListItem = (
    subEnvironment: Model.Environment,
    i: number
  ) => (
    <li
      key={i}
      className={subEnvironmentId == subEnvironment.id ? "selected" : ""}
    >
      <div>
        {renderDeleteSubEnv(subEnvironment)}

        <div
          className="select"
          onClick={() => pushSubEnvRoute(subEnvironment.id)}
        >
          <span>{g.getEnvironmentName(graph, subEnvironment.id)}</span>
          <SvgImage type="right-caret" />
        </div>
      </div>
    </li>
  );

  const renderLocalsListItem = () =>
    environmentRole.hasLocalKeys ? (
      <li key="locals" className={localsUserId ? "selected" : ""}>
        <div>
          <div
            className="select"
            onClick={() =>
              pushSubEnvRoute([props.envParentId, currentUserId].join("|"))
            }
          >
            <span>Locals</span>
            <SvgImage type="right-caret" />
          </div>
        </div>
      </li>
    ) : (
      ""
    );

  const renderList = () => {
    return (
      <ul>
        {[
          renderNewListItem(),
          renderLocalsListItem(),
          ...subEnvironments.map(renderSubEnvListItem),
        ]}
      </ul>
    );
  };

  const renderNewSubError = () => {
    if (hasSubmitError) {
      return <p>There was a problem creating the branch.</p>;
    }
  };

  const renderNewSubCopy = () => {
    if (subEnvironments.length == 0) {
      return (
        <p>
          <strong>BRANCHES</strong> allow you to extend base environments like
          Development, Staging, or Production by overriding existing variables
          or setting new ones.
        </p>
      );
    }
  };

  const renderSubmitBtn = () => {
    return (
      <input
        className="primary"
        type="submit"
        disabled={!newSubName || isSubmittingNew}
        value={`${isSubmittingNew ? "Creating" : "Create"} Branch${
          isSubmittingNew ? "..." : ""
        }`}
      />
    );
  };

  const renderNewForm = () => {
    return (
      <form
        className={
          styles.NewSubEnvForm +
          (subEnvironments.length == 0 ? " new-form-only" : "")
        }
        onSubmit={onSubmitNew}
      >
        {renderNewSubCopy()}
        {renderNewSubError()}
        <div className="field">
          {/* <label>
            New {g.getEnvironmentName(graph, parentEnvironmentId)}{" "}
            Branch
          </label> */}
          <input
            type="text"
            autoFocus
            disabled={isSubmittingNew}
            placeholder="Enter a name..."
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
          />
        </div>
        <div className="buttons">{renderSubmitBtn()}</div>
      </form>
    );
  };

  const renderSelected = () => {
    if (
      props.editingMultiline &&
      props.ui.envManager.showAddForm &&
      props.ui.envManager.entryForm.editingEnvironmentId
    ) {
      return "";
    }
    if (selectedNew) {
      return renderNewForm();
    } else if (subEnvironmentId || localsUserId) {
      const entryColWidth = Math.min(
        Math.max(
          selectedWidth * props.ui.envManager.entryColPct,
          styles.layout.ENTRY_COL_MIN_WIDTH
        ),
        styles.layout.ENTRY_COL_MAX_WIDTH
      );

      const environmentIds = [
        subEnvironmentId ?? [props.envParentId, localsUserId].join("|"),
      ];

      const gridProps = {
        ...props,
        environmentIds: environmentIds,
        entryColWidth,
        valColWidth: selectedWidth - entryColWidth,
      };

      return props.envParentType == "app" ? (
        <ui.AppEnvGrid {...gridProps} visibleEnvironmentIds={environmentIds} />
      ) : (
        <ui.BlockEnvGrid
          {...gridProps}
          visibleEnvironmentIds={environmentIds}
        />
      );
    }
  };

  if (subEnvironments.length == 0 && !environmentRole.hasLocalKeys) {
    return <div>{renderNewForm()}</div>;
  }

  return (
    <div className={styles.SubEnvs}>
      <section
        className={
          "sub-selected " +
          style({
            marginLeft: listWidth,
          })
        }
      >
        {renderSelected()}
      </section>
      <section
        className={
          "sub-list " +
          style({
            width: listWidth,
            height: `calc(100% - ${
              styles.layout.MAIN_HEADER_HEIGHT + props.ui.pendingFooterHeight
            }px)`,
            transition: "height",
            transitionDuration: "0.2s",
          })
        }
      >
        {renderList()}
      </section>
    </div>
  );
};
