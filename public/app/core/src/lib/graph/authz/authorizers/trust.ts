import { Graph } from "../../../../types";
import { authorizeUser, presence } from "./helpers";
import { canUpdateEnv, canUpdateLocals } from ".";
import {
  getEncryptedByEnvironmentIds,
  getEncryptedByLocalIds,
  getSignedByKeyableIds,
} from "../..";

export const canRevokeTrustedUserPubkey = (
  graph: Graph.Graph,
  currentUserId: string,
  targetId: string
) => {
  const currentUserRes = authorizeUser(graph, currentUserId);
  if (!currentUserRes) {
    return false;
  }

  const targetKeyable =
    presence(graph[targetId], "orgUserDevice", true) ||
    presence(graph[targetId], "cliUser", true);

  if (!targetKeyable) {
    return false;
  }

  const environmentIds = getEncryptedByEnvironmentIds(graph, targetKeyable.id);
  const localIds = getEncryptedByLocalIds(graph, targetKeyable.id);
  if (environmentIds.length > 0 || localIds.length > 0) {
    return false;
  }

  // for (let environmentId of environmentIds) {
  //   if (!canUpdateEnv(graph, currentUserId, environmentId)) {
  //     return false;
  //   }
  // }

  // for (let localId of localIds) {
  //   const [envParentId, localsUserId] = localId.split("|");
  //   if (!canUpdateLocals(graph, currentUserId, envParentId, localsUserId)) {
  //     return false;
  //   }
  // }

  const signedKeyableIds = getSignedByKeyableIds(graph, targetKeyable.id);
  for (let signedKeyableId of signedKeyableIds) {
    const keyable = graph[signedKeyableId];
    if (!keyable) {
      return false;
    }
  }

  return true;
};
