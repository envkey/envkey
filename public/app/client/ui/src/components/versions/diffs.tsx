import React from "react";
import { OrgComponent } from "@ui_types";
import { getEnvWithMeta, getDiffsByKey } from "@core/lib/client";
import { Client, Model } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import { twitterShortTs } from "@core/lib/utils/date";
import * as styles from "@styles";
import { SvgImage } from "@images";

type Props = {
  compareEnvWithMetaByEnvironmentId: Record<string, Client.Env.EnvWithMeta>;
};

export const Diffs: OrgComponent<{}, Props> = (props) => {
  const { compareEnvWithMetaByEnvironmentId, core } = props;
  const { graph } = core;

  const appIds = new Set<string>();
  const blockIds = new Set<string>();
  const diffsByEnvironmentId: Record<string, Client.Env.DiffsByKey> = {};
  const diffEnvironmentIds: string[] = [];

  for (let environmentId in compareEnvWithMetaByEnvironmentId) {
    let envParentId: string;
    const environment = graph[environmentId] as Model.Environment | undefined;
    if (environment) {
      envParentId = environment.envParentId;
    } else {
      [envParentId] = environmentId.split("|");
    }
    const envParent = graph[envParentId] as Model.EnvParent;

    const compare = compareEnvWithMetaByEnvironmentId[environmentId];
    const current = getEnvWithMeta(core, { envParentId, environmentId });
    const byKey = getDiffsByKey(compare.variables, current.variables);

    const hasDiffs = Object.keys(byKey).length > 0;
    if (hasDiffs) {
      diffsByEnvironmentId[environmentId] = byKey;
      (envParent.type == "app" ? appIds : blockIds).add(envParentId);
      diffEnvironmentIds.push(environmentId);
    }
  }

  const renderEnvParent = (envParentId: string) => {
    const envParent = graph[envParentId] as Model.EnvParent;
    const environments =
      g.getEnvironmentsByEnvParentId(graph)[envParentId] ?? [];
    const environmentIds = environments.map(R.prop("id"));
    const localsUserIds = Object.keys(envParent.localsUpdatedAtByUserId);
    const localsIds = localsUserIds.map((userId) =>
      [envParent.id, userId].join("|")
    );

    const updatedEnvironmentIds = R.intersection(
      [...environmentIds, ...localsIds],
      diffEnvironmentIds
    );

    const renderEnvironment = (environmentId: string) => {
      const environment = graph[environmentId] as Model.Environment | undefined;

      const environmentName = g.getEnvironmentName(graph, environmentId);

      const updatesByKey = diffsByEnvironmentId[environmentId] ?? {};
      const updatedKeys = Object.keys(updatesByKey);
      const numKeys = updatedKeys.length;

      const compareEnvWithMeta =
        compareEnvWithMetaByEnvironmentId[environmentId];
      const updatedEnvWithMeta = getEnvWithMeta(props.core, {
        envParentId,
        environmentId,
      });

      const environmentPrefix = [
        <span>{envParent.name}</span>,
        <SvgImage type="right-caret" />,
        environment && environment.isSub
          ? [
              <span>
                {g.getEnvironmentName(graph, environment.parentEnvironmentId)}
              </span>,
              <SvgImage type="right-caret" />,
            ]
          : "",
      ];

      let updatedById: string;
      let updatedAt: number;
      if (environment) {
        updatedById = environment.encryptedById!;
        updatedAt = environment.envUpdatedAt!;
      } else {
        const [, localsUserId] = environmentId.split("|");
        updatedById = envParent.localsEncryptedBy[localsUserId];
        updatedAt = envParent.localsUpdatedAtByUserId[localsUserId];
      }

      return (
        <div className="environment">
          <h4>
            {environmentPrefix}
            {environmentName}{" "}
          </h4>

          {updatedKeys.length > 0 ? (
            <div>
              {updatedKeys.map((key) => {
                const compareCell = compareEnvWithMeta.variables[key];
                const updatedCell = updatedEnvWithMeta.variables[key];

                return (
                  <div className={styles.KeyChange + " key-change"}>
                    <h4>
                      {environmentPrefix}
                      <span>{environmentName}</span>
                      <SvgImage type="right-caret" />
                      <label>{key}</label>{" "}
                    </h4>
                    <div className="change">
                      <div className="set-by">
                        <label>Set By</label>
                        <span>
                          <strong>{g.getUserName(graph, updatedById)}</strong>
                          <span className="sep">{" ● "}</span>
                          <span>{twitterShortTs(updatedAt)}</span>
                        </span>
                      </div>
                      <div>
                        <label>Was</label>
                        <span>
                          <ui.DiffCell
                            {...props}
                            cell={compareCell}
                            strikethrough={true}
                          />
                        </span>
                      </div>

                      <div className="update">
                        <label>Now</label>
                        <span>
                          <ui.DiffCell {...props} cell={updatedCell} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            ""
          )}
        </div>
      );
    };

    return (
      <div className="env-parent">
        <div>
          <h4>{envParent.name} </h4>
        </div>
        <div>{diffEnvironmentIds.map(renderEnvironment)}</div>
      </div>
    );
  };

  return (
    <div className={styles.Diffs}>
      {Array.from(appIds).concat(Array.from(blockIds)).map(renderEnvParent)}
    </div>
  );
};

export const DiffsModal: OrgComponent<
  {},
  Props & {
    envParentId: string;
    back: () => any;
  }
> = (props) => {
  const envParent = props.core.graph[props.envParentId] as Model.EnvParent;

  return (
    <div className={styles.DiffsModal}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          props.back();
        }}
        className="overlay"
      >
        <span className="back">
          <span>← Back</span>
        </span>
      </div>

      <div className="modal">
        <h3>
          <strong>{envParent.name}</strong> Recent Changes
        </h3>

        <Diffs {...props} />
      </div>
    </div>
  );
};
