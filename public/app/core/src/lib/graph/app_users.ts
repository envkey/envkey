import { Graph, Rbac, Model } from "../../types";
import * as R from "ramda";
import memoize from "../../lib/utils/memoize";
import {
  getGroupMembershipsByObjectId,
  getAppUserGroupsByComposite,
  getAppGroupUsersByComposite,
  getAppGroupUserGroupsByComposite,
} from "./indexed_graph";

const getSortByAppRoleFn =
  (graph: Graph.Graph) => (o: { appRoleId: string }) => {
    const appRole = graph[o.appRoleId] as Rbac.AppRole;
    return appRole.orderIndex;
  };

export const getAppUserGroupAssoc = memoize(
  (graph: Graph.Graph, appId: string, userId: string) => {
    const userGroupIds = (
        getGroupMembershipsByObjectId(graph)[userId] || []
      ).map(R.prop("groupId")),
      appUserGroup = R.sortBy(
        getSortByAppRoleFn(graph),
        userGroupIds
          .map(
            (userGroupId) =>
              getAppUserGroupsByComposite(graph)[appId + "|" + userGroupId]
          )
          .filter(Boolean) as Model.AppUserGroup[]
      )[0];
    if (appUserGroup) {
      return appUserGroup;
    }

    const appGroupIds = (getGroupMembershipsByObjectId(graph)[appId] || []).map(
        R.prop("groupId")
      ),
      appGroupUser = R.sortBy(
        getSortByAppRoleFn(graph),
        appGroupIds
          .map(
            (appGroupId) =>
              getAppGroupUsersByComposite(graph)[appGroupId + "|" + userId]
          )
          .filter(Boolean) as Model.AppGroupUser[]
      )[0];

    if (appGroupUser) {
      return appGroupUser;
    }

    const appGroupUserGroup = R.sortBy(
      getSortByAppRoleFn(graph),
      R.flatten(
        userGroupIds.map((userGroupId) =>
          appGroupIds.map(
            (appGroupId) =>
              getAppGroupUserGroupsByComposite(graph)[
                appGroupId + "|" + userGroupId
              ]
          )
        )
      ).filter(Boolean) as Model.AppGroupUserGroup[]
    )[0];

    if (appGroupUserGroup) {
      return appGroupUserGroup;
    }
  }
);
