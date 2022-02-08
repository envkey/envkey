import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { OrgComponent } from "@ui_types";
import { Client, Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { capitalizeAll } from "humanize-plus";
import humanize from "humanize-string";
import * as ui from "@ui";
import { SmallLoader, SvgImage } from "@images";

const getAppEnvkeysComponent = (
  keyableParentType: Model.KeyableParent["type"]
) => {
  const AppEnvkeys: OrgComponent<{ appId: string }> = (props) => {
    const { graph, graphUpdatedAt } = props.core;
    const currentUserId = props.ui.loadedAccountId!;
    const appId = props.routeParams.appId;

    const {
      baseEnvironments,
      keyableParentsByEnvironmentId,
      generatedEnvkeysByKeyableParentId,
      subEnvironmentsByParentEnvironmentId,
    } = useMemo(() => {
      let baseEnvironments = g.authz.getVisibleBaseEnvironments(
        graph,
        currentUserId,
        appId
      );

      baseEnvironments = baseEnvironments.filter(({ environmentRoleId }) => {
        const role = graph[environmentRoleId] as Rbac.EnvironmentRole;
        return keyableParentType == "localKey"
          ? role.hasLocalKeys
          : role.hasServers;
      });

      const keyableParentsByEnvironmentId =
        keyableParentType == "localKey"
          ? R.mapObjIndexed(
              (localKeys) =>
                localKeys
                  ? localKeys.filter(R.propEq("userId", currentUserId))
                  : localKeys,
              g.getLocalKeysByEnvironmentId(graph)
            )
          : g.getServersByEnvironmentId(graph);

      return {
        baseEnvironments,
        keyableParentsByEnvironmentId,
        generatedEnvkeysByKeyableParentId:
          g.getActiveGeneratedEnvkeysByKeyableParentId(graph),
        subEnvironmentsByParentEnvironmentId:
          g.getSubEnvironmentsByParentEnvironmentId(graph),
      };
    }, [graphUpdatedAt, currentUserId, appId]);

    const [license, numActiveServerEnvkeys] = useMemo(
      () => [
        g.graphTypes(graph).license,
        g.graphTypes(graph).org.serverEnvkeyCount,
      ],
      [graphUpdatedAt, currentUserId]
    );
    const licenseExpired =
      license.expiresAt != -1 && props.ui.now > license.expiresAt;

    const showEnvironmentLabel = !(
      keyableParentType == "localKey" && baseEnvironments.length == 1
    );

    const [showForm, setShowForm] = useState(false);
    const [formParentEnvironmentId, setFormParentEnvironmentId] = useState(
      baseEnvironments.length == 1 ? baseEnvironments[0].id : ""
    );
    const [formSubEnvironmentId, setFormSubEnvironmentId] = useState("");

    const formEnvironmentId = formSubEnvironmentId || formParentEnvironmentId;
    const existingKeyableParents =
      keyableParentsByEnvironmentId[formEnvironmentId] ?? [];

    const [formName, setFormName] = useState("");

    const [isCreating, setIsCreating] = useState(false);
    const [removingId, setRemovingId] = useState<string>();
    const [regeneratingId, setRegeneratingId] = useState<string>();

    const [confirming, setConfirming] = useState<{
      id: string;
      type: "remove" | "revoke" | "regen";
    }>();

    const [copiedId, setCopiedId] = useState("");

    useEffect(() => {
      return () => {
        props.dispatch({
          type: Client.ActionType.CLEAR_ALL_GENERATED_ENVKEYS,
        });
      };
    }, []);

    useEffect(() => {
      if (formEnvironmentId && existingKeyableParents.length == 0) {
        setFormName(
          `Default ${
            keyableParentType == "server"
              ? g.getEnvironmentName(graph, formEnvironmentId) + " Server"
              : "Local Key"
          }`
        );
      } else {
        setFormName("");
      }
    }, [formEnvironmentId]);

    useEffect(() => {
      if (removingId) {
        for (let environmentId in keyableParentsByEnvironmentId) {
          for (let keyableParent of keyableParentsByEnvironmentId[
            environmentId
          ] ?? []) {
            if (removingId == keyableParent.id) {
              return;
            }
          }
        }
        setRemovingId(undefined);
      }
    }, [keyableParentsByEnvironmentId]);

    useEffect(() => {
      if (regeneratingId && props.core.generatedEnvkeys[regeneratingId]) {
        setRegeneratingId(undefined);
      }
    }, [Object.keys(props.core.generatedEnvkeys).length]);

    const create = async () => {
      setIsCreating(true);
      await props.dispatch({
        type:
          keyableParentType == "localKey"
            ? Client.ActionType.CREATE_LOCAL_KEY
            : Client.ActionType.CREATE_SERVER,
        payload: {
          appId,
          name: formName,
          environmentId: formEnvironmentId,
        },
      });
      setShowForm(false);
      setIsCreating(false);
      setFormName("");
      setFormParentEnvironmentId(
        baseEnvironments.length == 1 ? baseEnvironments[0].id : ""
      );
      setFormSubEnvironmentId("");
    };

    const renderForm = () => {
      if (!showForm) {
        return "";
      }

      if (
        keyableParentType == "server" &&
        license.maxServerEnvkeys != -1 &&
        numActiveServerEnvkeys >= license.maxServerEnvkeys
      ) {
        return "";
      }

      return (
        <form>
          {keyableParentType == "localKey" ? (
            <p>
              <strong>Remember,</strong> you shouldn't normally need to generate
              a local key manually. They're generated{" "}
              <strong>automatically</strong> the first time you start an
              EnvKey-enabled app--you just need to be sure you have EnvKey
              installed, you're signed in, and your app has a{" "}
              <strong>.envkey</strong> file in its root directory. If your app
              is missing a <strong>.envkey</strong> file, you can add it by
              running the <code>envkey init</code> command in your app's root
              directory.
            </p>
          ) : (
            ""
          )}

          {baseEnvironments.length > 1 ? (
            <div className="field">
              <label>Environment</label>
              <div className="select">
                <select
                  value={formParentEnvironmentId}
                  onChange={(e) => setFormParentEnvironmentId(e.target.value)}
                >
                  {[
                    <option value={""} disabled>
                      Select an environment
                    </option>,
                    ...baseEnvironments.map((environment) => (
                      <option value={environment.id}>
                        {g.getEnvironmentName(graph, environment.id)}
                      </option>
                    )),
                  ]}
                </select>
                <SvgImage type="down-caret" />
              </div>
            </div>
          ) : (
            ""
          )}

          {formParentEnvironmentId &&
          subEnvironmentsByParentEnvironmentId[formParentEnvironmentId] ? (
            <div className="field">
              <label>Branch</label>
              <div className="select">
                <select
                  value={formSubEnvironmentId}
                  onChange={(e) => setFormSubEnvironmentId(e.target.value)}
                >
                  {[
                    <option value={""}>Base environment</option>,
                    ...subEnvironmentsByParentEnvironmentId[
                      formParentEnvironmentId
                    ]!.map((environment) => (
                      <option value={environment.id}>
                        {g.getEnvironmentName(graph, environment.id)}
                      </option>
                    )),
                  ]}
                </select>
                <SvgImage type="down-caret" />
              </div>
            </div>
          ) : (
            ""
          )}

          {formParentEnvironmentId ? (
            <div className="field">
              <label>Name</label>
              <input
                type="text"
                autoFocus={true}
                value={formName}
                placeholder="Enter a name..."
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
          ) : (
            ""
          )}

          <div className="buttons">
            <button className="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={
                isCreating || !formParentEnvironmentId || !formName.trim()
              }
              onClick={async (e) => {
                e.preventDefault();
                create();
              }}
            >
              {isCreating ? <SmallLoader /> : "Create"}
            </button>
          </div>
        </form>
      );
    };

    const renderKeyableParent = (keyableParent: Model.KeyableParent) => {
      const justGenerated = props.core.generatedEnvkeys[keyableParent.id];
      const generatedEnvkey =
        generatedEnvkeysByKeyableParentId[keyableParent.id];

      return (
        <ui.KeyableParent
          {...props}
          keyableParent={keyableParent}
          justGenerated={justGenerated}
          generatedEnvkey={generatedEnvkey}
          copied={copiedId == keyableParent.id}
          onCopied={() => setCopiedId(keyableParent.id)}
          confirming={confirming?.id == keyableParent.id}
          confirmingType={confirming?.type}
          onConfirm={(confirmType) =>
            setConfirming({ id: keyableParent.id, type: confirmType })
          }
          onCancelConfirm={() => setConfirming(undefined)}
          removing={removingId == keyableParent.id}
          onRemove={() => setRemovingId(keyableParent.id)}
          regenerating={regeneratingId == keyableParent.id}
          onRegenerate={() => setRegeneratingId(keyableParent.id)}
          license={license}
          licenseExpired={licenseExpired}
          numActive={numActiveServerEnvkeys}
        />
      );
    };

    const renderEnvironmentSection = (environment: Model.Environment) => {
      const keyableParents = (keyableParentsByEnvironmentId[environment.id] ??
        []) as Model.KeyableParent[];
      const subEnvironments =
        subEnvironmentsByParentEnvironmentId[environment.id] ?? [];

      const environmentRole = graph[
        environment.environmentRoleId
      ] as Rbac.EnvironmentRole;
      const label = environmentRole.name + " Server";

      return (
        <div>
          {showEnvironmentLabel ? <h4>{label}s</h4> : ""}
          {keyableParents.length > 0 ? (
            <div className="assoc-list">
              {keyableParents.map(renderKeyableParent)}
            </div>
          ) : (
            ""
          )}

          {keyableParentType == "server" && keyableParents.length == 0 ? (
            <div className="field empty-placeholder">
              <span>No {label} Keys have been generated.</span>
            </div>
          ) : (
            ""
          )}

          {subEnvironments.length > 0
            ? subEnvironments.map(renderSubEnvironmentSection)
            : ""}
        </div>
      );
    };

    const renderSubEnvironmentSection = (subEnvironment: Model.Environment) => {
      const keyableParents = (keyableParentsByEnvironmentId[
        subEnvironment.id
      ] ?? []) as Model.KeyableParent[];

      const label = g.getEnvironmentName(graph, subEnvironment.id);
      const role = graph[
        subEnvironment.environmentRoleId
      ] as Rbac.EnvironmentRole;

      return (
        <div className="sub-environments">
          <h5>
            <span>
              <span className="base">
                {role.name}
                <span className="sep">→</span>
              </span>
              {label}
            </span>
          </h5>

          <div className="assoc-list">
            {keyableParents.map(renderKeyableParent)}
          </div>

          {keyableParentType == "server" && keyableParents.length == 0 ? (
            <div className="field empty-placeholder">
              <span>No {label} Server Keys have been generated.</span>
            </div>
          ) : (
            ""
          )}
        </div>
      );
    };

    const renderCreate = () => {
      if (
        keyableParentType == "server" &&
        ((license.maxServerEnvkeys != -1 &&
          numActiveServerEnvkeys >= license.maxServerEnvkeys) ||
          licenseExpired)
      ) {
        const blockStatement = licenseExpired
          ? [
              `Your organization's ${
                license.provisional ? "provisional " : ""
              }license has `,
              <strong>expired.</strong>,
            ]
          : [
              "Your organization has reached its limit of ",
              <strong>
                {license.maxServerEnvkeys} ENVKEY
                {license.maxServerEnvkeys == 1 ? "" : "s"}.
              </strong>,
            ];

        return (
          <div>
            <p>{blockStatement}</p>
            {g.authz.hasOrgPermission(
              graph,
              currentUserId,
              "org_manage_billing"
            ) ? (
              [
                <p>
                  To generate more Servers,{" "}
                  {licenseExpired ? "renew" : "upgrade"} your org's license.
                </p>,
                <div className="buttons">
                  <Link
                    className="primary"
                    to={props.orgRoute("/my-org/billing")}
                  >
                    Go To Billing →
                  </Link>
                </div>,
              ]
            ) : (
              <p>
                To invite someone else, ask an admin to{" "}
                {licenseExpired ? "renew" : "upgrade"} your org's license.
              </p>
            )}
          </div>
        );
      }

      return (
        <div className="buttons">
          <button
            className="primary"
            onClick={() => {
              setShowForm(true);
            }}
          >
            Generate New {capitalizeAll(humanize(keyableParentType))}
            {keyableParentType == "server" ? " Key" : ""}
          </button>
        </div>
      );
    };

    return (
      <div>
        <div>{showForm ? renderForm() : renderCreate()}</div>
        <div>{baseEnvironments.map(renderEnvironmentSection)}</div>
      </div>
    );
  };

  return AppEnvkeys;
};

export const AppLocalEnvkeys = getAppEnvkeysComponent("localKey");
export const AppServerEnvkeys = getAppEnvkeysComponent("server");
