import { Api, Model, Rbac, Graph } from "../../types";
import * as R from "ramda";
import { pick } from "../utils/pick";

import { graphTypes } from "./base";
import { getOrgPermissions, getEnvParentPermissions } from "./permissions";
import { getGroupsByObjectType } from "./indexed_graph";
import * as authz from "./authz";
import { getPermittedBlocksForUser } from "./user_blocks";

export const getPermittedGraphObjects = (
  graph: Graph.Graph,
  userId: string,
  deviceId: string | undefined,
  includeDeleted = false
) => {
  const filteredGraph = includeDeleted
      ? graph
      : (R.filter(
          ({ deletedAt }) => !deletedAt,
          graph as R.Dictionary<Graph.GraphObject>
        ) as Graph.Graph),
    byType = graphTypes(filteredGraph);

  const org = byType.org,
    user = filteredGraph[userId] as Model.CliUser | Model.OrgUser | undefined,
    currentOrgRole = user
      ? (filteredGraph[user.orgRoleId] as Rbac.OrgRole)
      : undefined,
    currentOrgPermissions = currentOrgRole
      ? getOrgPermissions(filteredGraph, currentOrgRole.id)
      : new Set<Rbac.OrgPermission>();
  // permitted apps/blocks and associations

  if (!user || !currentOrgRole) {
    return {
      org,
      apps: [],
      blocks: [],
      orgUsers: [],
      orgUserDevices: [],
      cliUsers: [],
      deviceGrants: [],
      invites: [],
      appUserGrants: [],
      appBlocks: [],
      groupMemberships: [],
      groups: [],
      appUserGroups: [],
      appGroupUserGroups: [],
      appGroupUsers: [],
      appGroupBlocks: [],
      appBlockGroups: [],
      appGroupBlockGroups: [],
      servers: [],
      localKeys: [],
      includedAppRoles: [],
      environments: [],
      variableGroups: [],
      generatedEnvkeys: [],
      recoveryKeys: [],
      orgRoles: [],
      appRoles: [],
      environmentRoles: [],
      appRoleEnvironmentRoles: [],
      externalAuthProviders: [],
      scimProvisioningProviders: [],
      pubkeyRevocationRequests: [],
      rootPubkeyReplacements: [],
      products: [],
      prices: [],
      customer: undefined,
      subscription: undefined,
      paymentSource: undefined,
    };
  }

  const permittedApps = currentOrgRole?.autoAppRoleId
      ? byType.apps
      : byType.apps.filter(
          ({ id: appId }) =>
            getEnvParentPermissions(filteredGraph, appId, userId).size > 0
        ),
    permittedAppIds = new Set(permittedApps.map(R.prop("id"))),
    permittedAppBlocks = currentOrgPermissions.has("blocks_read_all")
      ? byType.appBlocks
      : byType.appBlocks.filter(({ appId }) => permittedAppIds.has(appId)),
    permittedBlocks = getPermittedBlocksForUser(filteredGraph, userId),
    permittedBlockIds = new Set(permittedBlocks.map(R.prop("id"))),
    permittedAppUserGrants = currentOrgRole?.autoAppRoleId
      ? byType.appUserGrants
      : byType.appUserGrants.filter(({ appId }) => permittedAppIds.has(appId));

  const permittedOrgUsers = byType.orgUsers,
    permittedCliUsers = byType.cliUsers,
    permittedUserIds = new Set([
      ...permittedOrgUsers.map(R.prop("id")),
      ...permittedCliUsers.map(R.prop("id")),
    ]);

  const [
      permittedOrgUserDevices,
      permittedDeviceGrants,
      permittedInvites,
      permittedRecoveryKeys,
    ] = [
      byType.orgUserDevices,
      byType.deviceGrants,
      byType.invites,
      byType.recoveryKeys,
    ],
    // app-level associations based on permitted apps
    [
      permittedServers,
      permittedLocalKeys,
      permittedIncludedAppRoles,
      permittedGeneratedEnvkeys,
    ] = currentOrgRole?.autoAppRoleId
      ? [
          byType.servers,
          byType.localKeys,
          byType.includedAppRoles,
          byType.generatedEnvkeys,
        ]
      : ((
          [
            byType.servers,
            byType.localKeys,
            byType.includedAppRoles,
            byType.generatedEnvkeys,
          ] as { appId: string }[][]
        ).map((objects) =>
          objects.filter((obj) => permittedAppIds.has(obj.appId))
        ) as [
          Model.Server[],
          Model.LocalKey[],
          Model.IncludedAppRole[],
          Model.GeneratedEnvkey[]
        ]),
    permittedEnvironments = byType.environments.filter(
      ({ envParentId }) =>
        permittedAppIds.has(envParentId) || permittedBlockIds.has(envParentId)
    ),
    permittedEnvironmentIds = new Set(permittedEnvironments.map(R.prop("id"))),
    permittedVariableGroups = byType.variableGroups.filter((variableGroup) =>
      variableGroup.subEnvironmentId
        ? permittedEnvironmentIds.has(variableGroup.subEnvironmentId)
        : permittedAppIds.has(variableGroup.envParentId) ||
          permittedBlockIds.has(variableGroup.envParentId)
    ),
    permittedGroupMembers = byType.groupMemberships.filter((member) => {
      const group = filteredGraph[member.groupId] as Model.Group;
      switch (group.objectType) {
        case "app":
          return permittedAppIds.has(member.objectId);
        case "block":
          return permittedBlockIds.has(member.objectId);
        case "orgUser":
          return permittedUserIds.has(member.objectId);
      }
    }),
    permittedMemberGroupIds = new Set(
      permittedGroupMembers.map(R.prop("groupId"))
    );

  let permittedGroups: Model.Group[] = [];
  if (
    currentOrgPermissions.has("org_manage_app_groups") ||
    currentOrgPermissions.has("org_manage_teams") ||
    currentOrgPermissions.has("org_manage_block_groups")
  ) {
    const groupsByObjectType = getGroupsByObjectType(filteredGraph);
    if (currentOrgPermissions.has("org_manage_app_groups")) {
      permittedGroups = permittedGroups.concat(groupsByObjectType["app"] ?? []);
    }

    if (currentOrgPermissions.has("org_manage_teams")) {
      permittedGroups = permittedGroups.concat(
        groupsByObjectType["orgUser"] ?? []
      );
    }

    if (currentOrgPermissions.has("org_manage_block_groups")) {
      permittedGroups = permittedGroups.concat(
        groupsByObjectType["block"] ?? []
      );
    }
  } else {
    permittedGroups = byType.groups.filter(({ id }) =>
      permittedMemberGroupIds.has(id)
    );
  }

  const permittedGroupIds = new Set(permittedGroups.map(R.prop("id"))),
    [
      permittedAppUserGroups,
      permittedAppGroupUserGroups,
      permittedAppGroupUsers,
      permittedAppGroupBlocks,
      permittedAppBlockGroups,
      permittedAppGroupBlockGroups,
    ] = (
      [
        [
          byType.appUserGroups,
          { appId: permittedAppIds, userGroupId: permittedGroupIds },
        ],
        [
          byType.appGroupUserGroups,
          {
            appGroupId: permittedGroupIds,
            userGroupId: permittedGroupIds,
          },
        ],
        [
          byType.appGroupUsers,
          { userId: permittedUserIds, appGroupId: permittedGroupIds },
        ],
        [
          byType.appGroupBlocks,
          { blockId: permittedBlockIds, appGroupId: permittedGroupIds },
        ],
        [
          byType.appBlockGroups,
          { appId: permittedAppIds, blockGroupId: permittedGroupIds },
        ],
        [
          byType.appGroupBlockGroups,
          {
            appGroupId: permittedGroupIds,
            blockGroupId: permittedGroupIds,
          },
        ],
      ] as [Graph.GraphObject[], { [prop: string]: Set<string> }][]
    ).map(([objects, propSets]) =>
      objects.filter((obj: any) => {
        for (let k in propSets) {
          if (!propSets[k].has(obj[k])) {
            return false;
          }
        }
        return true;
      })
    ) as [
      Model.AppUserGroup[],
      Model.AppGroupUserGroup[],
      Model.AppGroupUser[],
      Model.AppGroupBlock[],
      Model.AppBlockGroup[],
      Model.AppGroupBlockGroup[]
    ];

  const permitted = {
    org,
    apps: permittedApps,
    blocks: permittedBlocks,
    orgUsers: permittedOrgUsers,
    orgUserDevices: permittedOrgUserDevices,
    cliUsers: permittedCliUsers,
    deviceGrants: permittedDeviceGrants,
    invites: permittedInvites,
    recoveryKeys: permittedRecoveryKeys,
    appUserGrants: permittedAppUserGrants,
    appBlocks: permittedAppBlocks,
    groupMemberships: permittedGroupMembers,
    groups: permittedGroups,
    appUserGroups: permittedAppUserGroups,
    appGroupUserGroups: permittedAppGroupUserGroups,
    appGroupUsers: permittedAppGroupUsers,
    appGroupBlocks: permittedAppGroupBlocks,
    appBlockGroups: permittedAppBlockGroups,
    appGroupBlockGroups: permittedAppGroupBlockGroups,
    servers: permittedServers,
    localKeys: permittedLocalKeys,
    includedAppRoles: permittedIncludedAppRoles,
    environments: permittedEnvironments,
    variableGroups: permittedVariableGroups,
    generatedEnvkeys: permittedGeneratedEnvkeys,
    ...pick(
      [
        "orgRoles",
        "appRoles",
        "environmentRoles",
        "appRoleEnvironmentRoles",
        "externalAuthProviders",
        "scimProvisioningProviders",
      ],
      byType
    ),
    pubkeyRevocationRequests: byType.pubkeyRevocationRequests.filter(
      (request) =>
        !request.deletedAt &&
        authz.canRevokeTrustedUserPubkey(
          filteredGraph,
          userId,
          request.targetId
        )
    ),
    rootPubkeyReplacements: byType.rootPubkeyReplacements.filter(
      (
        replacement: Model.RootPubkeyReplacement | Api.Db.RootPubkeyReplacement
      ) => {
        return "processedAtById" in replacement
          ? replacement.processedAtById[deviceId ?? userId] === false
          : true;
      }
    ),
    products: currentOrgPermissions.has("org_manage_billing")
      ? byType.products
      : [],
    prices: currentOrgPermissions.has("org_manage_billing")
      ? byType.prices
      : [],
    customer: currentOrgPermissions.has("org_manage_billing")
      ? byType.customer
      : undefined,
    subscription: currentOrgPermissions.has("org_manage_billing")
      ? byType.subscription
      : undefined,
    paymentSource: currentOrgPermissions.has("org_manage_billing")
      ? byType.paymentSource
      : undefined,
  };

  return permitted;
};
