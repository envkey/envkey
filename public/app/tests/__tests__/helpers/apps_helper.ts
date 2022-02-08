import { dispatch, getState } from "./test_helper";
import { Client, Model } from "@core/types";
import * as R from "ramda";
import { graphTypes } from "@core/lib/graph";
import waitForExpect from "wait-for-expect";

export const createApp = async (
  accountId: string,
  name: string = "Test App"
) => {
  let state = getState(accountId);

  const promise = dispatch(
    {
      type: Client.ActionType.CREATE_APP,
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
    expect(state.isCreatingApp).toBeTrue();
  });

  const res = await promise;

  expect(res.success).toBeTrue();

  state = res.state;

  const allEnvironmentRoles = graphTypes(state.graph).environmentRoles,
    defaultEnvironmentRoles = allEnvironmentRoles.filter(
      R.propEq("defaultAllApps", true as boolean)
    ),
    allAppRoles = graphTypes(state.graph).appRoles,
    defaultAppRoles = allAppRoles.filter(
      R.propEq("defaultAllApps", true as boolean)
    );

  expect(defaultEnvironmentRoles.length).toBe(3);
  expect(defaultAppRoles.length).toBe(5);

  expect(Object.values(state.graph)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "app",
        name,
        settings: { autoCaps: true },
      }),
      ...defaultEnvironmentRoles.map(({ id }) =>
        expect.objectContaining({
          type: "environment",
          environmentRoleId: id,
        })
      ),
      ...defaultAppRoles.map(({ id }) =>
        expect.objectContaining({
          type: "includedAppRole",
          appRoleId: id,
        })
      ),
    ])
  );

  const { apps } = graphTypes(state.graph);

  return R.last(
    R.sortBy(R.prop("createdAt"), apps.filter(R.propEq("name", name)))
  ) as Model.App;
};
