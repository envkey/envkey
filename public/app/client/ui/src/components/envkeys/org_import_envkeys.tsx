import React, { useState, useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import * as styles from "@styles";

export const OrgImportEnvkeys: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const [copiedId, setCopiedId] = useState("");

  const {
    generatedEnvkeysByKeyableParentId,
    generatedServersByEnvironmentId,
    appIds,
    baseEnvironmentIdsByAppId,
    subEnvironmentIdsByParentEnvironmentId,
  } = useMemo(() => {
    const { apps } = g.graphTypes(graph);

    const generatedEnvkeysByKeyableParentId =
      g.getActiveGeneratedEnvkeysByKeyableParentId(graph);

    const appIds = new Set<string>();
    const baseEnvironmentIdsByAppId: Record<string, Set<string>> = {};
    const subEnvironmentIdsByParentEnvironmentId: Record<
      string,
      Set<string>
    > = {};
    const generatedServersByEnvironmentId: Record<string, Model.Server[]> = {};

    for (let app of apps) {
      const environments = g.getEnvironmentsByEnvParentId(graph)[app.id] ?? [];
      for (let environment of environments) {
        const servers =
          g.getServersByEnvironmentId(graph)[environment.id] ?? [];
        for (let server of servers) {
          const generated = generatedEnvkeysByKeyableParentId[server.id];
          const justGenerated = props.core.generatedEnvkeys[server.id];

          if (generated && justGenerated) {
            appIds.add(server.appId);

            if (environment.isSub) {
              (baseEnvironmentIdsByAppId[environment.envParentId] ??=
                new Set()).add(environment.parentEnvironmentId);
              (subEnvironmentIdsByParentEnvironmentId[
                environment.parentEnvironmentId
              ] ??= new Set()).add(environment.id);
            } else {
              (baseEnvironmentIdsByAppId[environment.envParentId] ??=
                new Set()).add(environment.id);
            }

            (generatedServersByEnvironmentId[server.environmentId] ??= []).push(
              server
            );
          }
        }
      }
    }

    return {
      generatedEnvkeysByKeyableParentId,
      generatedServersByEnvironmentId,
      appIds,
      baseEnvironmentIdsByAppId,
      subEnvironmentIdsByParentEnvironmentId,
    };
  }, [graphUpdatedAt, currentUserId]);

  const renderAppSection = (appId: string) => {
    const app = graph[appId] as Model.App;
    const baseEnvironmentIds = baseEnvironmentIdsByAppId[appId];

    return (
      <div>
        <h3>
          <strong>{app.name}</strong> Servers
        </h3>

        <div>
          {Array.from(baseEnvironmentIds).map(renderEnvironmentSection)}
        </div>
      </div>
    );
  };

  const renderEnvironmentSection = (environmentId: string) => {
    const environment = graph[environmentId] as Model.Environment;
    const app = graph[environment.envParentId] as Model.App;
    const servers = generatedServersByEnvironmentId[environmentId] ?? [];
    const subEnvironmentIds =
      subEnvironmentIdsByParentEnvironmentId[environmentId] ?? new Set();

    const environmentRole = graph[
      environment.environmentRoleId
    ] as Rbac.EnvironmentRole;
    const label = environmentRole.name + " Server";

    return (
      <div>
        <h4>
          <span className="base">
            {app.name}
            <span className="sep">→</span>
          </span>
          {label}s
        </h4>
        {servers.length > 0 ? (
          <div className="assoc-list">{servers.map(renderServer)}</div>
        ) : (
          ""
        )}

        {subEnvironmentIds.size > 0
          ? Array.from(subEnvironmentIds).map(renderSubEnvironmentSection)
          : ""}
      </div>
    );
  };

  const renderSubEnvironmentSection = (subEnvironmentId: string) => {
    const subEnvironment = graph[subEnvironmentId] as Model.Environment;
    const servers = generatedServersByEnvironmentId[subEnvironmentId] ?? [];

    const app = graph[subEnvironment.envParentId] as Model.App;

    const label = g.getEnvironmentName(graph, subEnvironmentId);
    const role = graph[
      subEnvironment.environmentRoleId
    ] as Rbac.EnvironmentRole;

    return (
      <div className="sub-environments">
        <h5>
          <span>
            <span className="base">
              {app.name}
              <span className="sep">→</span>
              {role.name}
              <span className="sep">→</span>
            </span>
            {label}
          </span>
        </h5>

        <div className="assoc-list">{servers.map(renderServer)}</div>
      </div>
    );
  };

  const renderServer = (server: Model.Server) => {
    const justGenerated = props.core.generatedEnvkeys[server.id];
    const generatedEnvkey = generatedEnvkeysByKeyableParentId[server.id];

    return (
      <ui.KeyableParent
        {...props}
        keyableParent={server}
        justGenerated={justGenerated}
        generatedEnvkey={generatedEnvkey}
        copied={copiedId == server.id}
        onCopied={() => setCopiedId(server.id)}
        omitHelpCopy={true}
        omitDoneButton={true}
      />
    );
  };

  return (
    <div className={styles.OrgImportEnvkeys}>
      <div>{Array.from(appIds).map(renderAppSection)}</div>
    </div>
  );
};
