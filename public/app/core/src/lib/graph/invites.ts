import { Graph, Model } from "../../types";
import { getActiveOrExpiredInvitesByInviteeId } from "./indexed_graph";

export const getInviteStatus = (
  graph: Graph.Graph,
  userId: string,
  now: number
): Model.InviteStatus => {
  const user = graph[userId] as Model.OrgUser;

  if (user.isCreator) {
    return "creator";
  }

  if (user.inviteAcceptedAt) {
    return "accepted";
  }

  const invites = getActiveOrExpiredInvitesByInviteeId(graph)[user.id] ?? [];
  const mostRecentInvite = invites[invites.length - 1];

  if (!mostRecentInvite) {
    return "failed";
  } else if (now > mostRecentInvite.expiresAt) {
    return "expired";
  } else if (mostRecentInvite.v1Invite) {
    return "pending-v1-upgrade";
  }

  return "pending";
};
