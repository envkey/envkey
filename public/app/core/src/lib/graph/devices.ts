import { Graph, Model } from "../../types";
import * as R from "ramda";
import memoize from "../../lib/utils/memoize";
import {
  getOrgUserDevicesByUserId,
  getActiveInvitesByInviteeId,
  getActiveDeviceGrantsByGranteeId,
  getActiveRecoveryKeysByUserId,
} from "./indexed_graph";

export const getDeviceIdsForUser = memoize(
    (graph: Graph.Graph, userId: string, now: number) => {
      const cliUser = graph[userId] as Model.CliUser | undefined;
      if (cliUser && cliUser.type == "cliUser") {
        return cliUser.deactivatedAt ? [] : ["cli"];
      }

      const orgUserDevicesByUserId = getOrgUserDevicesByUserId(graph),
        activeInvitesByInviteeId = getActiveInvitesByInviteeId(graph, now),
        activeDeviceGrantsByGranteeId = getActiveDeviceGrantsByGranteeId(
          graph,
          now
        );

      const res = [
          ...(orgUserDevicesByUserId[userId] ?? [])
            .filter(({ deactivatedAt }) => !deactivatedAt)
            .map(R.prop("id")),
          ...(activeInvitesByInviteeId[userId] || []).map(R.prop("id")),
          ...(activeDeviceGrantsByGranteeId[userId] || []).map(R.prop("id")),
        ],
        activeRecoveryKey = getActiveRecoveryKeysByUserId(graph)[userId];

      if (activeRecoveryKey) {
        res.push(activeRecoveryKey.id);
      }

      return res;
    }
  ),
  getPubkeysByDeviceIdForUser = memoize(
    (graph: Graph.Graph, userId: string, now: number) => {
      const cliUser = graph[userId] as Model.CliUser | undefined;
      if (cliUser && cliUser.type == "cliUser") {
        return {
          ["cli"]: cliUser.pubkey,
        };
      }

      const orgUserDevicesByUserId = getOrgUserDevicesByUserId(graph),
        activeInvitesByInviteeId = getActiveInvitesByInviteeId(graph, now),
        activeDeviceGrantsByGranteeId = getActiveDeviceGrantsByGranteeId(
          graph,
          now
        );

      const res = R.mergeAll([
          ...(orgUserDevicesByUserId[userId] ?? [])
            .filter(({ deactivatedAt }) => !deactivatedAt)
            .map(({ id, pubkey }) => ({
              [id]: pubkey,
            })),
          ...(activeInvitesByInviteeId[userId] || []).map(({ id, pubkey }) => ({
            [id]: pubkey,
          })),
          ...(activeDeviceGrantsByGranteeId[userId] || []).map(
            ({ id, pubkey }) => ({
              [id]: pubkey,
            })
          ),
        ]),
        activeRecoveryKey = getActiveRecoveryKeysByUserId(graph)[userId];

      if (activeRecoveryKey) {
        res[activeRecoveryKey.id] = activeRecoveryKey.pubkey;
      }

      return res;
    }
  );
