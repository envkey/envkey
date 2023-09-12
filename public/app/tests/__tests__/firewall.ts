import "./helpers/dotenv_helper";
import { getTestId, getState, dispatch } from "./helpers/test_helper";
import { Api, Client, Model } from "@core/types";
import { registerWithEmail } from "./helpers/auth_helper";
import { getEnvironments } from "./helpers/envs_helper";
import { createApp } from "./helpers/apps_helper";
import { envkeyFetch, envkeyFetchExpectError } from "./helpers/fetch_helper";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { log } from "@core/lib/utils/logger";
import { getPool } from "@api_shared/db";
import { getOrgGraph } from "@api_shared/graph";

describe("firewall", () => {
  let email: string, orgId: string, ownerDeviceId: string, ownerId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({
      orgId,
      deviceId: ownerDeviceId,
      userId: ownerId,
    } = await registerWithEmail(email));
  });

  describe("local ips", () => {
    test("can't make a request if current ip doesn't match localIpsAllowed", async () => {
      const res = await dispatch(
        {
          type: Api.ActionType.SET_ORG_ALLOWED_IPS,
          payload: {
            localIpsAllowed: ["155.130.90.61", "192.168.0.1/24"],
            environmentRoleIpsAllowed: {},
          },
        },
        ownerId,
        undefined,
        undefined,
        "155.130.90.60"
      );

      expect(res.success).toBe(false);
      expect((res.resultAction as any).payload.error.code).toBe(422);
      expect((res.resultAction as any).payload.error.message).toBe(
        "Current user IP not allowed by localIpsAllowed"
      );
    });

    test("can make a request if local ip matches an ip", async () => {
      let res = await dispatch(
        {
          type: Api.ActionType.SET_ORG_ALLOWED_IPS,
          payload: {
            localIpsAllowed: ["155.130.90.61", "192.168.200.6/30"],
            environmentRoleIpsAllowed: {},
          },
        },
        ownerId,
        undefined,
        undefined,
        "155.130.90.61"
      );

      expect(res.success).toBe(true);

      res = await dispatch(
        {
          type: Client.ActionType.CREATE_APP,
          payload: {
            name: "Test App",
            settings: {
              autoCaps: true,
            },
          },
        },
        ownerId,
        undefined,
        undefined,
        "155.130.90.61"
      );

      expect(res.success).toBe(true);

      res = await dispatch(
        {
          type: Client.ActionType.CREATE_APP,
          payload: {
            name: "Test App",
            settings: {
              autoCaps: true,
            },
          },
        },
        ownerId,
        undefined,
        undefined,
        "155.130.90.65"
      );

      expect(res.success).toBe(false);
      expect((res.resultAction as any).payload.error.code).toBe(401);
      expect((res.resultAction as any).payload.error.message).toBe(
        "ip not permitted"
      );
    });

    test("can update org ips and make a request if local ip matches a CIDR range", async () => {
      let res = await dispatch(
        {
          type: Api.ActionType.SET_ORG_ALLOWED_IPS,
          payload: {
            localIpsAllowed: ["155.130.90.61", "192.168.200.4/30"],
            environmentRoleIpsAllowed: {},
          },
        },
        ownerId,
        undefined,
        undefined,
        "192.168.200.5"
      );

      expect(res.success).toBe(true);

      res = await dispatch(
        {
          type: Client.ActionType.CREATE_APP,
          payload: {
            name: "Test App",
            settings: {
              autoCaps: true,
            },
          },
        },
        ownerId,
        undefined,
        undefined,
        "192.168.200.5"
      );

      expect(res.success).toBe(true);

      res = await dispatch(
        {
          type: Client.ActionType.CREATE_APP,
          payload: {
            name: "Test App",
            settings: {
              autoCaps: true,
            },
          },
        },
        ownerId,
        undefined,
        undefined,
        "192.168.202.1"
      );

      expect(res.success).toBe(false);
      expect((res.resultAction as any).payload.error.code).toBe(401);
      expect((res.resultAction as any).payload.error.message).toBe(
        "ip not permitted"
      );
    });
  });

  describe("environment ips", () => {
    test("when setting org environment ips allowed, it correctly protects ENVKEYs", async () => {
      // create an app
      const app = await createApp(ownerId);

      const [development, staging, production] = getEnvironments(
        ownerId,
        app.id
      );

      // set some org allowed ips for different environments
      let res = await dispatch(
        {
          type: Api.ActionType.SET_ORG_ALLOWED_IPS,
          payload: {
            environmentRoleIpsAllowed: {
              [development.environmentRoleId]: ["127.0.0.1"],
              [staging.environmentRoleId]: ["192.168.202.9"],
              [production.environmentRoleId]: ["192.168.200.4/30"],
            },
          },
        },
        ownerId
      );

      expect(res.success).toBe(true);

      // set inherits, extends, and overrides for app environments
      res = await dispatch(
        {
          type: Api.ActionType.SET_APP_ALLOWED_IPS,
          payload: {
            id: app.id,

            environmentRoleIpsMergeStrategies: {
              [development.environmentRoleId]: undefined,
              [staging.environmentRoleId]: "extend",
              [production.environmentRoleId]: "override",
            },

            environmentRoleIpsAllowed: {
              [development.environmentRoleId]: undefined,
              [staging.environmentRoleId]: ["192.168.202.1"],
              [production.environmentRoleId]: ["192.166.209.4/30"],
            },
          },
        },
        ownerId
      );
      expect(res.success).toBe(true);

      // generate some servers
      await dispatch(
        {
          type: Client.ActionType.CREATE_SERVER,
          payload: {
            appId: app.id,
            name: "Development Server",
            environmentId: development.id,
          },
        },
        ownerId
      );

      await dispatch(
        {
          type: Client.ActionType.CREATE_SERVER,
          payload: {
            appId: app.id,
            name: "Staging Server",
            environmentId: staging.id,
          },
        },
        ownerId
      );

      await dispatch(
        {
          type: Client.ActionType.CREATE_SERVER,
          payload: {
            appId: app.id,
            name: "Production Server",
            environmentId: production.id,
          },
        },
        ownerId
      );

      // ensure they all have the right allowedIps set
      const orgGraph = await getOrgGraph(orgId, {
        transactionConnOrPool: getPool(),
      });
      const generatedEnvkeys = g.graphTypes(orgGraph).generatedEnvkeys;
      expect(generatedEnvkeys.length).toBe(3);

      const generatedEnvkeysByEnvironmentId = R.indexBy(
        R.prop("environmentId"),
        generatedEnvkeys
      ) as Record<string, Api.Db.GeneratedEnvkey>;

      expect(
        generatedEnvkeysByEnvironmentId[development.id].allowedIps
      ).toEqual(expect.arrayContaining(["127.0.0.1"]));

      expect(generatedEnvkeysByEnvironmentId[staging.id].allowedIps).toEqual(
        expect.arrayContaining(["192.168.202.9", "192.168.202.1"])
      );

      expect(generatedEnvkeysByEnvironmentId[production.id].allowedIps).toEqual(
        expect.arrayContaining(["192.166.209.4/30"])
      );

      // ensure we can fetch with an allowed ip
      let state = getState(ownerId);

      const { servers } = g.graphTypes(state.graph),
        devServer = servers.filter(
          R.propEq("environmentId", development.id)
        )[0],
        stagingServer = servers.filter(
          R.propEq("environmentId", staging.id)
        )[0],
        prodServer = servers.filter(
          R.propEq("environmentId", production.id)
        )[0];

      const { envkeyIdPart: devEnvkeyIdPart, encryptionKey: devEncryptionKey } =
          state.generatedEnvkeys[devServer.id],
        {
          envkeyIdPart: stagingEnvkeyIdPart,
          encryptionKey: stagingEncryptionKey,
        } = state.generatedEnvkeys[stagingServer.id],
        { envkeyIdPart: prodEnvkeyIdPart, encryptionKey: prodEncryptionKey } =
          state.generatedEnvkeys[prodServer.id];

      // ensure we can fetch with an allowed ip and can't fetch with a forbidden ip
      // should be able to load development and not load staging or production
      let env = await envkeyFetch(devEnvkeyIdPart, devEncryptionKey);
      expect(env).toEqual({});

      envkeyFetchExpectError(stagingEnvkeyIdPart, stagingEncryptionKey);
      envkeyFetchExpectError(prodEnvkeyIdPart, prodEncryptionKey);

      // update org allowed ips
      res = await dispatch(
        {
          type: Api.ActionType.SET_ORG_ALLOWED_IPS,
          payload: {
            environmentRoleIpsAllowed: {
              [development.environmentRoleId]: ["127.0.0.9"],
              [staging.environmentRoleId]: ["127.0.0.1"],
              [production.environmentRoleId]: ["127.0.0.1"],
            },
          },
        },
        ownerId
      );
      expect(res.success).toBe(true);

      // ensure update got through to ENVKEYs
      envkeyFetchExpectError(devEnvkeyIdPart, devEncryptionKey);

      env = await envkeyFetch(stagingEnvkeyIdPart, stagingEncryptionKey);
      expect(env).toEqual({});

      envkeyFetchExpectError(prodEnvkeyIdPart, prodEncryptionKey);

      // updated app allowed ips
      res = await dispatch(
        {
          type: Api.ActionType.SET_APP_ALLOWED_IPS,
          payload: {
            id: app.id,

            environmentRoleIpsMergeStrategies: {
              [development.environmentRoleId]: "override",
              [staging.environmentRoleId]: "override",
              [production.environmentRoleId]: "extend",
            },

            environmentRoleIpsAllowed: {
              [development.environmentRoleId]: ["127.0.0.1"],
              [staging.environmentRoleId]: ["192.168.202.1"],
              [production.environmentRoleId]: ["127.0.0.0/30"],
            },
          },
        },
        ownerId
      );
      expect(res.success).toBe(true);

      // ensure update got through to ENVKEYs
      env = await envkeyFetch(devEnvkeyIdPart, devEncryptionKey);
      expect(env).toEqual({});

      envkeyFetchExpectError(stagingEnvkeyIdPart, stagingEncryptionKey);

      env = await envkeyFetch(prodEnvkeyIdPart, prodEncryptionKey);
      expect(env).toEqual({});
    });
  });
});
