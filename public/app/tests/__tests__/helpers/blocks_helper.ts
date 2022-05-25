import { dispatch, getState } from "./test_helper";
import { Api, Client, Model } from "@core/types";
import * as R from "ramda";
import { graphTypes } from "@core/lib/graph";
import waitForExpect from "wait-for-expect";
import { log } from "@core/lib/utils/logger";

export const createBlock = async (
    accountId: string,
    name: string = "Test Block"
  ) => {
    let state = getState(accountId);

    const promise = dispatch<Client.Action.ClientActions["CreateBlock"]>(
      {
        type: Client.ActionType.CREATE_BLOCK,
        payload: {
          name,
          settings: {
            autoCaps: true,
          },
        },
      },
      accountId
    );

    await waitForExpect(() => {
      state = getState(accountId);
      expect(state.isCreatingBlock).toBeTrue();
    });

    const res = await promise;
    expect(res.success).toBeTrue();

    state = res.state;

    const allEnvironmentRoles = graphTypes(state.graph).environmentRoles,
      defaultEnvironmentRoles = allEnvironmentRoles.filter(
        R.propEq("defaultAllBlocks", true as boolean)
      );

    expect(defaultEnvironmentRoles.length).toBe(3);

    expect(Object.values(state.graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "block",
          name,
          settings: { autoCaps: true },
        }),
        ...defaultEnvironmentRoles.map(({ id }) =>
          expect.objectContaining({
            type: "environment",
            environmentRoleId: id,
          })
        ),
      ])
    );

    const { blocks } = graphTypes(state.graph);

    return R.last(
      R.sortBy(R.prop("createdAt"), blocks.filter(R.propEq("name", name)))
    ) as Model.Block;
  },
  connectBlocks = async (
    accountId: string,
    params: { blockId: string; appId: string; orderIndex: number }[]
  ) => {
    const promise = dispatch(
      {
        type: Client.ActionType.CONNECT_BLOCKS,
        payload: params,
      },
      accountId
    );

    let state = getState(accountId);

    for (let { blockId, appId } of params) {
      expect(state.isConnectingBlocks[blockId][appId]).toBeTrue();
      expect(state.isConnectingBlocks[appId][blockId]).toBeTrue();
    }

    const res = await promise;

    expect(res.success).toBeTrue();

    state = getState(accountId);
    expect(state.isConnectingBlocks).toEqual({});

    return res;
  };
