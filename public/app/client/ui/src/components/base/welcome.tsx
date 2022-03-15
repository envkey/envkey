import React, { useMemo, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Rbac } from "@core/types";
import * as styles from "@styles";
import * as g from "@core/lib/graph";

export const Welcome: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const { apps, org } = g.graphTypes(graph);
  const currentUserId = props.ui.loadedAccountId!;
  const user = graph[currentUserId] as Model.OrgUser;

  const orgRole = graph[user.orgRoleId] as Rbac.OrgRole;
  const autoAppRole = orgRole.autoAppRoleId
    ? (graph[orgRole.autoAppRoleId] as Rbac.AppRole)
    : undefined;

  useEffect(() => {
    props.setUiState({ startedOnboarding: true });
  }, []);

  const {
    canCreateApp,
    canCreateBlock,
    canInviteUser,
    canCreateCliUser,
    canManageDevices,
    canManageOrgUsers,
    canManageCliUsers,
    hasMyOrg,
    hasFullPermissions,
    isCreatorWithFullPermissions,
  } = useMemo(() => {
    const orgPermissions = g.getOrgPermissions(graph, orgRole.id);
    const appPermissions = autoAppRole
      ? g.getAppPermissions(graph, autoAppRole.id)
      : undefined;

    const allOrgPermissions = Object.keys(Rbac.orgPermissions);
    const allAppPermissions = Object.keys(Rbac.appPermissions);

    const hasFullPermissions =
      autoAppRole &&
      autoAppRole.hasFullEnvironmentPermissions &&
      orgPermissions.size == allOrgPermissions.length &&
      appPermissions &&
      appPermissions.size == allAppPermissions.length;

    const isCreatorWithFullPermissions =
      hasFullPermissions && org.creatorId == user.id;

    return {
      canCreateApp: g.authz.canCreateApp(graph, currentUserId),
      canCreateBlock: g.authz.canCreateBlock(graph, currentUserId),
      canInviteUser: g.authz.canInviteAny(graph, currentUserId),
      canCreateCliUser: g.authz.canCreateAnyCliUser(graph, currentUserId),
      canManageDevices: g.authz.canManageAnyDevicesOrGrants(
        graph,
        currentUserId
      ),
      canManageOrgUsers: g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_users"
      ),
      canManageCliUsers: g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_cli_users"
      ),
      hasMyOrg: g.authz.hasAnyOrgPermissions(graph, currentUserId, [
        "org_manage_settings",
        "org_generate_recovery_key",
        "org_read_logs",
        "self_hosted_read_host_logs",
        "org_manage_billing",
      ]),
      hasFullPermissions,
      isCreatorWithFullPermissions,
    };
  }, [graphUpdatedAt]);

  const canCreateAny = [
    canCreateApp,
    canCreateBlock,
    canInviteUser,
    canCreateCliUser,
    canManageDevices,
  ].some(Boolean);

  let addActionsCopy: string;
  const addActions: string[] = [];
  const creatableTypes: string[] = [];

  if (canInviteUser) {
    addActions.push("invite people to your org");
  }
  if (canManageDevices) {
    addActions.push("give access to additional devices");
  }
  if (canCreateApp) {
    creatableTypes.push("apps");
  }
  if (canCreateBlock) {
    creatableTypes.push("blocks");
  }
  if (canCreateCliUser) {
    creatableTypes.push("CLI keys");
  }

  let createString = creatableTypes.join("/");
  if (createString) {
    addActions.push(`create ${createString}`);
  }

  if (addActions.length == 3) {
    addActionsCopy = `${addActions[0]}, ${addActions[1]}, or ${addActions[2]}`;
  } else if (addActions.length == 2) {
    addActionsCopy = addActions.join(" or ");
  } else {
    addActionsCopy = addActions[0];
  }

  let startCopy: React.ReactNode[];
  if (apps.length == 0 && (canCreateApp || canInviteUser)) {
    startCopy = [
      <strong>To start,</strong>,
      " you'll probably want to ",
      [
        canCreateApp ? "create an app" : "",
        canInviteUser ? "invite some people" : "",
      ]
        .filter(Boolean)
        .join(" or "),
      ".",
    ];
  } else if (apps.length > 0) {
    startCopy = [
      <strong>To start,</strong>,
      " click any ",
      <em>app</em>,
      " in the sidebar.",
    ];
  } else {
    startCopy = [
      <strong>For now,</strong>,
      " you'll have to wait for an admin to give you access to something.",
    ];
  }

  return (
    <div className={styles.OrgContainer}>
      <h3>
        Welcome <strong>Home</strong>
      </h3>
      <p>
        👋 Hi there, <strong>{user.firstName}.</strong> Welcome to{" "}
        <strong>{org.name},</strong> your{" "}
        {isCreatorWithFullPermissions ? "brand new " : ""}
        EnvKey org.
      </p>

      <p>
        👈 If you take a look to your left, you'll see the{" "}
        <strong>sidebar.</strong> Here you can find anything and everything{" "}
        {hasFullPermissions ? "in your org" : "you've been granted access to"},
        which could include:
      </p>

      <p>
        <em>Apps.</em> These represent the projects/services/processes that use
        your EnvKey config. They have multiple <strong>environments</strong>{" "}
        associated with them, like <strong>development, </strong>
        <strong>staging, </strong>
        <strong>production, </strong> and user-specific{" "}
        <strong>local overrides.</strong>
      </p>

      <p>
        <em>Blocks.</em> These are stackable, reusable groups of environment
        variables that can be connected to multiple apps to prevent duplication.
        Like apps, they can have multiple <strong>environments.</strong>
      </p>

      {canManageOrgUsers ? (
        <p>
          <em>People.</em> These are carbon-based life forms, much like
          yourself. They can be <strong>invited</strong> to the org as
          collaborators with whatever level of access they need to do their
          thing.
        </p>
      ) : (
        ""
      )}

      {canManageCliUsers ? (
        <p>
          <em>CLI Keys.</em> These can be used with the EnvKey CLI to script or
          automate actions. They have access levels just like human users.
        </p>
      ) : (
        ""
      )}

      <p>
        <em>Settings Menu.</em> For{" "}
        {hasMyOrg ? "org, account, or device" : "account or device"} settings,
        click the header at the very top of the sidebar with your org's name on
        it.
      </p>

      {canCreateAny ? (
        <p>
          <em>Add Menu.</em> To {addActionsCopy}, click the <em>Add</em> button.
        </p>
      ) : (
        ""
      )}

      <p>{startCopy}</p>
    </div>
  );
};
