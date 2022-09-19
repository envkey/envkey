import React from "react";
import {
  OrgComponent,
  OrgComponentProps,
  RouterTree,
  RouterNode,
} from "@ui_types";
import { Route, Switch, Redirect, RouteComponentProps } from "react-router-dom";
import * as R from "ramda";
import * as ui from "@ui";
import { Model } from "@core/types";

const getRouterTree = (): RouterTree => [
  {
    routerPath: "/welcome",
    component: ui.Welcome,
  },
  {
    routerPath: "/new-app",
    component: ui.NewApp,
  },
  {
    routerPath: "/new-block",
    component: ui.NewBlock,
  },
  {
    routerPath: "/new-team",
    component: ui.NewTeam,
  },

  // Org-level invites
  ...getInviteRoutes(),

  // Org-level cli keys
  ...getCliKeyRoutes(),

  // Apps
  {
    routerPath: "/apps/:appId",
    component: ui.AppContainer,
    redirect: envParentRedirectFn,
    tree: getEnvParentTree("app"),
  },

  // Blocks
  {
    routerPath: "/blocks/:blockId",
    component: ui.BlockContainer,
    redirect: envParentRedirectFn,
    tree: getEnvParentTree("block"),
  },

  // Org Users
  {
    routerPath: "/orgUsers/:userId",
    component: ui.UserContainer,
    redirect: userRedirectFn,
    tree: getUserTree("orgUser"),
  },

  // teams
  {
    routerPath: "/teams/:groupId",
    component: ui.TeamContainer,
    redirect: getGroupRedirectFn("orgUser"),
    tree: [
      {
        routerPath: "/members-add",
        component: ui.TeamAddMembers,
      },
      {
        routerPath: "/members",
        component: ui.TeamMembers,
      },
      {
        routerPath: "/apps-add",
        component: ui.TeamAddApps,
      },
      {
        routerPath: "/apps",
        component: ui.TeamApps,
      },

      {
        routerPath: "/settings",
        component: ui.GroupSettings,
      },
    ],
  },

  // Cli Users
  {
    routerPath: "/cliUsers/:userId",
    component: ui.UserContainer,
    redirect: userRedirectFn,
    tree: getUserTree("cliUser"),
  },

  // My Org
  {
    routerPath: "/my-org",
    component: ui.MyOrgContainer,
    tree: [
      {
        routerPath: "/settings",
        component: ui.OrgSettings,
      },
      {
        routerPath: "/environment-settings/environment-role-form/:editingId?",
        component: ui.EnvironmentRoleForm,
      },
      {
        routerPath: "/environment-settings",
        component: ui.ManageOrgEnvironmentRoles,
      },

      {
        routerPath: "/firewall",
        component: ui.OrgFirewall,
      },

      // SAML Routes
      {
        routerPath: "/sso/new-saml/create",
        component: ui.SamlCreateStep,
      },
      {
        routerPath: "/sso/new-saml/sp/:providerId",
        component: ui.SamlSPStep,
      },

      {
        routerPath: "/sso/new-saml/idp/:providerId",
        component: ui.SamlIDPStep,
      },

      {
        routerPath: "/sso/new-saml/success/:providerId",
        component: ui.SamlSuccess,
      },
      {
        routerPath: "/sso/saml/:providerId",
        component: ui.SamlForm,
      },

      // SCIM Routes

      {
        routerPath: "/sso/scim/success/:providerId/:authSecret?",
        component: ui.ScimSuccess,
      },

      {
        routerPath: "/sso/scim/:providerId?",
        component: ui.ScimForm,
      },

      {
        routerPath: "/sso",
        component: ui.SSOSettings,
      },

      // remaining org routes
      {
        routerPath: `/billing/subscription`,
        component: ui.UpdateCloudSubscription,
      },
      {
        routerPath: `/billing`,
        component: ui.BillingUI,
      },
      {
        routerPath: `/logs/:logManagerStateBs58?`,
        component: ui.LogManager,
      },
      {
        routerPath: `/recovery-key`,
        component: ui.ManageRecoveryKey,
      },
      {
        routerPath: "/archive",
        component: ui.OrgArchiveV1,
      },
    ],
  },

  // Org Devices
  {
    routerPath: `/devices/:userId?`,
    component: ui.OrgDevices,
  },

  // Fallback Routes
  {
    routerPath: "/no-apps-or-blocks",
    component: ui.NoAppsOrBlocks,
  },
  {
    routerPath: "/not-found",
    component: ui.ObjectNotFound,
  },
];

const getInviteRoutes = (): RouterTree => [
  {
    routerPath: "/invite-users/form/:editIndex?",
    component: ui.InviteForm,
  },
  {
    routerPath: "/invite-users/generated",
    component: ui.GeneratedInvites,
  },
  {
    routerPath: "/invite-users",
    component: ui.InviteUsers,
  },
];

const getCliKeyRoutes = (): RouterTree => [
  {
    routerPath: "/new-cli-key/generated",
    component: ui.GeneratedCliUsers,
  },
  {
    routerPath: "/new-cli-key",
    component: ui.NewCliUser,
  },
];

const getEnvParentTree = (envParentType: Model.EnvParent["type"]): RouterTree =>
  [
    {
      routerPath: "/environments/:environmentId?/:subRoute?/:subEnvironmentId?",
      component: ui.EnvManager,
    },

    getCollaboratorNode(envParentType, "orgUser"),

    getCollaboratorNode(envParentType, "cliUser"),

    envParentType == "app"
      ? {
          routerPath: "/envkeys",
          component: ui.AppEnvkeysContainer,
        }
      : undefined,

    envParentType == "app"
      ? {
          routerPath: "/firewall",
          component: ui.AppFirewall,
        }
      : undefined,

    envParentType == "block"
      ? {
          routerPath: "/apps-add",
          component: ui.BlockAddApps,
        }
      : undefined,

    envParentType == "block"
      ? {
          routerPath: "/apps",
          component: ui.BlockApps,
        }
      : undefined,

    {
      routerPath: "/settings/environment-role-form/:editingId?",
      component: ui.EnvironmentRoleForm,
    },

    {
      routerPath: "/settings",
      component: {
        app: ui.AppSettings,
        block: ui.BlockSettings,
      }[envParentType],
    },

    {
      routerPath: "/versions/:environmentOrLocalsUserId?/:filterEntryKeys?",
      component: ui.Versions,
    },
    {
      routerPath: `/logs/:logManagerStateBs58?`,
      component: ui.LogManager,
    },
  ].filter((node): node is RouterNode => Boolean(node));

const getUserTree = (
  userType: (Model.OrgUser | Model.CliUser)["type"]
): RouterTree => [
  {
    routerPath: "/apps-add",
    component: ui.UserAddApps,
  },
  {
    component: ui.UserApps,
    routerPath: `/apps/:appId?`,
  },

  ...(userType == "orgUser"
    ? [
        {
          routerPath: "/teams-add",
          component: ui.UserAddTeams,
        },
        {
          component: ui.UserTeams,
          routerPath: `/teams/:userGroupId?`,
        },
      ]
    : []),

  {
    component: ui.UserBlocks,
    routerPath: `/blocks/:blockId?`,
  },
  {
    routerPath: "/devices",
    component: ui.UserDevices,
  },
  {
    routerPath: "/settings",
    component: {
      orgUser: ui.OrgUserSettings,
      cliUser: ui.CliUserSettings,
    }[userType],
  },
  {
    routerPath: `/logs/:logManagerStateBs58?`,
    component: ui.LogManager,
  },
];

const getCollaboratorNode = (
  envParentType: Model.EnvParent["type"],
  userType: (Model.OrgUser | Model.CliUser)["type"]
): RouterNode => ({
  routerPath: `/${
    {
      orgUser: "collaborators",
      cliUser: "cli-keys",
    }[userType]
  }`,
  component: {
    orgUser: {
      app: ui.AppCollaboratorsContainer,
      block: ui.BlockOrgUsers,
    },
    cliUser: {
      app: ui.AppCliUsersContainer,
      block: ui.BlockCliUsers,
    },
  }[userType][envParentType],
  tree: [
    ...(envParentType == "app" && userType == "orgUser"
      ? [
          {
            routerPath: "/list/add",
            component: ui.AppAddOrgUsersContainer,
            tree: [
              { routerPath: "/existing", component: ui.AppAddOrgUsers },
              ...getInviteRoutes(),
            ],
          },
          {
            routerPath: "/list",
            component: ui.AppOrgUsers,
          },
          {
            routerPath: "/teams",
            component: ui.AppTeams,
            tree: [
              {
                routerPath: "/add",
                component: ui.AppAddTeams,
              },
            ],
          },
        ]
      : []),

    ...(envParentType == "app" && userType == "cliUser"
      ? [
          {
            routerPath: "/list/add",
            component: ui.AppAddCliUsersContainer,
            tree: [
              { routerPath: "/existing", component: ui.AppAddCliUsers },
              ...getCliKeyRoutes(),
            ],
          },
          {
            routerPath: "/list",
            component: ui.AppCliUsers,
          },
        ]
      : []),
  ],
});

type Props = {
  nested?: true;
  routerTree?: RouterTree;
};

export const OrgRoutes: OrgComponent<{}, Props> = (componentProps) => {
  const routes = (
    routesProps: OrgComponentProps<{}, { routerTree?: RouterTree }>
  ): Route[] => {
    const routerTree = routesProps.routerTree ?? getRouterTree();

    return R.flatten(
      routerTree
        .map((node, i) => {
          const path =
            (routesProps.baseRouterPath ?? componentProps.match.path ?? "") +
            (node.routerPath ?? "");

          if (node.routerPath) {
            return (
              <Route
                key={i}
                path={path}
                render={getRenderFn(componentProps, routesProps, node, path)}
              />
            );
          } else if (node.tree) {
            return routes({
              ...routesProps,
              routerTree: node.tree,
              baseRouterPath: path,
            });
          }
        })
        .filter(Boolean)
    ) as Route[];
  };

  return (
    <div>
      <Switch>
        {routes(componentProps)}
        {componentProps.nested ? (
          ""
        ) : (
          <Redirect to={componentProps.orgRoute("/not-found")} />
        )}
      </Switch>
    </div>
  );
};

const getRenderFn =
  (
    componentProps: OrgComponentProps<{ orgId: string }, Props>,
    routesProps: OrgComponentProps,
    node: RouterNode,
    path: string
  ) =>
  (routeProps: RouteComponentProps<{ orgId: string }>) => {
    const childProps = {
      ...routesProps,
      ...routeProps,
      baseRouterPath: path,
      routeParams: {
        ...componentProps.routeParams,
        ...(routeProps.match?.params ?? {}),
      },
      routerTree: node.tree ?? [],
    };

    if (node.redirect) {
      const redirect = node.redirect(childProps);
      if (redirect) {
        return <Redirect to={redirect} />;
      }
    }

    if (!node.component) {
      return <OrgRoutes {...childProps} nested={true} />;
    }

    return routesProps.ui.loadedAccountId ? (
      <div>
        {React.createElement(node.component!, childProps)}
        {node.tree ? <OrgRoutes {...childProps} nested={true} /> : ""}
      </div>
    ) : (
      <div></div>
    );
  };

const envParentRedirectFn = (
  props: OrgComponentProps<{ appId: string } | { blockId: string }>
) => {
  const { graph } = props.core;

  let envParentId: string;
  let envParentType: Model.EnvParent["type"];
  if ("appId" in props.routeParams) {
    envParentId = props.routeParams.appId;
    envParentType = "app";
  } else {
    envParentId = props.routeParams.blockId;
    envParentType = "block";
  }

  const envParent = graph[envParentId] as Model.EnvParent | undefined;

  if (!envParent) {
    if (props.ui.justDeletedObjectId == envParentId) {
      props.setUiState(R.omit(["justDeletedObjectId"], props.ui));
    } else {
      alert(`This ${envParentType} has been removed or you have lost access.`);
    }

    return props.orgRoute("");
  }
  return false;
};

const getGroupRedirectFn =
  (objectType: Model.Group["objectType"]) =>
  (props: OrgComponentProps<{ groupId: string }>) => {
    const { graph } = props.core;
    const groupId = props.routeParams.groupId;
    const group = graph[groupId] as Model.Group;

    if (!group) {
      if (props.ui.justDeletedObjectId == groupId) {
        props.setUiState(R.omit(["justDeletedObjectId"], props.ui));
      } else {
        alert(`This ${objectType} has been removed or you have lost access.`);
      }

      return props.orgRoute("");
    }
    return false;
  };

const userRedirectFn = (props: OrgComponentProps<{ userId: string }>) => {
  if (props.ui.justRegeneratedInviteForUserId == props.routeParams.userId) {
    return false;
  }
  const { graph } = props.core;
  const user = graph[props.routeParams.userId] as
    | Model.OrgUser
    | Model.CliUser
    | undefined;

  if (!user || user.deactivatedAt) {
    return props.orgRoute("");
  }
  return false;
};
