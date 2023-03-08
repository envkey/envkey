import * as R from "ramda";
import * as g from "@core/lib/graph";
import { Client, Model } from "@core/types";
import { UiTree, UiNode, FlatTree, FlatNode } from "@ui_types";
import { getEnvParentPath, getUserPath } from "./paths";

// configuration of signed in org routes and searchable tree menu

type MaybeNode = UiNode | undefined;
type MaybeTree = MaybeNode[];
type TreeFn = (
  state: Client.State,
  currentUserId: string,
  now: number
) => UiTree;
type MaybeNodeFn = (
  state: Client.State,
  currentUserId: string,
  now: number
) => MaybeNode;
type NodeFn<T = UiNode> = (
  state: Client.State,
  currentUserId: string,
  now: number
) => T;
type NodeMapFn<T> = NodeFn<(obj: T) => UiNode>;

export const getUiTree: TreeFn = (state, currentUserId, now) => {
  const tree: MaybeTree = [
    appsNode(state, currentUserId, now),
    appGroupsNode(state, currentUserId, now),
    blocksNode(state, currentUserId, now),
    blockGroupsNode(state, currentUserId, now),
    usersNode(state, currentUserId, now),
    teamsNode(state, currentUserId, now),
    cliUsersNode(state, currentUserId, now),
  ];

  return tree.filter(Boolean) as UiTree;
};

const appsNode: MaybeNodeFn = (state, currentUserId, now) => {
  const { apps } = g.graphTypes(state.graph);
  return apps.length > 0
    ? {
        label: "Apps",
        showInTree: true,
        id: "apps",
        header: true,
        tree: apps.map(envParentNodeFn(state, currentUserId, now)),
      }
    : undefined;
};

const appGroupsNode: MaybeNodeFn = (state, currentUserId, now) => {
  const appGroups = g.getGroupsByObjectType(state.graph)["app"] ?? [];
  return appGroups.length > 0
    ? {
        label: "App Groups",
        showInTree: true,
        id: "appGroups",
        header: true,
        tree: appGroups.map((appGroup) => ({
          label: appGroup.name,
          id: appGroup.id,
          path: `/app_groups/${appGroup.id}`,
          showInTree: true,
          searchable: true,
        })),
      }
    : undefined;
};

const blocksNode: MaybeNodeFn = (state, currentUserId, now) => {
  const { blocks } = g.graphTypes(state.graph);
  if (
    blocks.length > 0
    // || g.authz.hasOrgPermission(state.graph, currentUserId, "blocks_read_all")
  ) {
    return {
      label: "Blocks",
      showInTree: true,
      id: "blocks",
      header: true,
      tree: blocks.map(envParentNodeFn(state, currentUserId, now)),
    };
  }
  return undefined;
};

const blockGroupsNode: MaybeNodeFn = (state, currentUserId, now) => {
  const blockGroups = g.getGroupsByObjectType(state.graph)["block"] ?? [];
  return blockGroups.length > 0
    ? {
        label: "Block Groups",
        showInTree: true,
        id: "blockGroups",
        header: true,
        tree: blockGroups.map((blockGroup) => ({
          label: blockGroup.name,
          id: blockGroup.id,
          path: `/block_groups/${blockGroup.id}`,
          showInTree: true,
          searchable: true,
        })),
      }
    : undefined;
};

type UserStatus =
  | "active"
  | "pending"
  | "pending-v1-upgrade"
  | "expired"
  | "failed";
const usersNode: MaybeNodeFn = (state, currentUserId, now) => {
  const users = g.authz.getListableOrgUsers(state.graph, currentUserId);

  if (users.length > 0) {
    return {
      label: "People",
      showInTree: true,
      id: "orgUsers",
      header: true,
      tree: orgUsersByStatusTree(
        state,
        currentUserId,
        users,
        userNodeFn,
        "users",
        now
      ),
    };
  }
  return undefined;
};

const teamsNode: MaybeNodeFn = (state, currentUserId, now) => {
  const teams = g.getGroupsByObjectType(state.graph)["orgUser"] ?? [];
  return teams.length > 0 &&
    g.authz.hasOrgPermission(state.graph, currentUserId, "blocks_read_all")
    ? {
        label: "Teams",
        showInTree: true,
        id: "teams",
        header: true,
        tree: teams.map((team) => ({
          label: team.name,
          id: team.id,
          path: `/teams/${team.id}`,
          showInTree: true,
          searchable: true,
        })),
      }
    : undefined;
};

const cliUsersNode: MaybeNodeFn = (state, currentUserId, now) => {
  const cliUsers = g.authz.getListableCliUsers(state.graph, currentUserId);

  if (cliUsers.length > 0) {
    return {
      label: "CLI Keys",
      showInTree: true,
      id: "cliUsers",
      header: true,
      tree: groupByOrgRoles(
        state,
        currentUserId,
        cliUsers,
        userNodeFn,
        "",
        now
      ),
    };
  }
  return undefined;
};

const envParentNodeFn =
  (state: Client.State, currentUserId: string, now: number) =>
  (envParent: Model.EnvParent): UiNode => {
    const path = getEnvParentPath(envParent);

    return {
      label: envParent.name,
      id: envParent.id,
      path,
      showInTree: true,
      searchable: true,
      // hasEnvUpdate: envsNeedFetch(state, envParent.id),
      // tree: envParentTree.filter(Boolean) as UiTree,
    };
  };

const groupByOrgRoles = <UserType extends Model.OrgUser | Model.CliUser>(
  state: Client.State,
  currentUserId: string,
  users: UserType[],
  nodeMapFn: NodeMapFn<UserType>,
  idPrefix: string,
  now: number
): UiTree => {
  const { orgRoles } = g.graphTypes(state.graph);

  const byOrgRoleId = R.groupBy(R.prop("orgRoleId"), users);

  return orgRoles
    .filter(({ id }) => byOrgRoleId[id])
    .map(({ id, name }) => ({
      id: [idPrefix, id].join("|"),
      label: name + " Access",
      showInTree: true,
      tree: byOrgRoleId[id].map(nodeMapFn(state, currentUserId, now)),
      defaultExpanded: true,
    }));
};

const orgUsersByStatusTree = (
  state: Client.State,
  currentUserId: string,
  orgUsers: Model.OrgUser[],
  nodeMapFn: NodeMapFn<Model.OrgUser>,
  idPrefix: string,
  now: number
) => {
  const byStatus = R.groupBy(({ id }) => {
    const status = g.getInviteStatus(state.graph, id, now);
    if (status == "accepted" || status == "creator") {
      return <const>"active";
    } else {
      return status;
    }
  }, orgUsers) as Record<UserStatus, Model.OrgUser[] | undefined>;

  const [active, pending, pendingV1Upgrade, expired, failed] = R.props(
    ["active", "pending", "pending-v1-upgrade", "expired", "failed"],
    byStatus
  ).map((a) => a ?? []);

  return [
    ...groupByOrgRoles(state, currentUserId, active, nodeMapFn, idPrefix, now),

    pending.length > 0
      ? {
          id: [idPrefix, "pending"].join("|"),
          label: "Invite Pending",
          showInTree: true,
          tree: pending.map(nodeMapFn(state, currentUserId, now)),
        }
      : undefined,

    pendingV1Upgrade.length > 0
      ? {
          id: [idPrefix, "pendin-v1-upgrade"].join("|"),
          label: "V1 Upgrade Pending",
          showInTree: true,
          tree: pendingV1Upgrade.map(nodeMapFn(state, currentUserId, now)),
        }
      : undefined,

    expired.length > 0
      ? {
          id: [idPrefix, "expired"].join("|"),
          label: "Invite Expired",
          showInTree: true,
          tree: expired.map(nodeMapFn(state, currentUserId, now)),
        }
      : undefined,

    failed.length > 0
      ? {
          id: [idPrefix, "failed"].join("|"),
          label: "Invite Failed",
          showInTree: true,
          tree: failed.map(nodeMapFn(state, currentUserId, now)),
        }
      : undefined,
  ].filter(Boolean) as UiTree;
};

const userNodeFn =
  (state: Client.State, currentUserId: string, now: number) =>
  (user: Model.OrgUser | Model.CliUser): UiNode => {
    const path = getUserPath(user);

    return {
      label: g.getUserName(state.graph, user.id),
      id: user.id,
      path,
      showInTree: true,
      searchable: true,
    };
  };

export const flattenTree = (
  tree: UiTree,
  parentIds: string[] = []
): FlatTree => {
  let flattened: FlatTree = [];

  for (let node of tree) {
    const subTree = node.tree;
    const flatNode: FlatNode = {
      ...R.omit(["tree"], node),
      parentIds,
    };
    flattened.push(flatNode);
    if (subTree) {
      flattened = flattened.concat(
        flattenTree(subTree, [...parentIds, ...(node.id ? [node.id] : [])])
      );
    }
  }

  return flattened;
};

export const findNode = (tree: UiTree, id: string): MaybeNode => {
  for (let node of tree) {
    if (node.id == id) {
      return node;
    }
    if (node.tree) {
      const res = findNode(node.tree, id);
      if (res) {
        return res;
      }
    }
  }
};
