process.env.NODE_ENV = "test";
process.env.IS_TEST = "1";
Error.stackTraceLimit = Infinity;

import "jest-extended";

import crossFetch from "@core/lib/utils/cross_fetch";
import * as testCore from "../../../test_core/src/test_core";
import { setApiHost } from "../../../test_core/src/test_core";

jest.setTimeout(60 * 1000 * 4);

beforeEach(() => {
  testCore.resetTestId();
});

export const hostUrl = process.env.DOMAIN!,
  clientParams = testCore.clientParams,
  getTestId = testCore.getTestId,
  resetTestId = testCore.resetTestId,
  getDeviceStore = testCore.getDeviceStore,
  getState = testCore.getState,
  dispatch = testCore.dispatch,
  waitForStateCondition = testCore.waitForStateCondition,
  waitForSerialAction = testCore.waitForSerialAction;

if (!hostUrl) {
  throw new Error("Missing DOMAIN from .env file");
}

setApiHost(hostUrl);

// sanity check
crossFetch("https://" + hostUrl).catch((err) => {
  console.error("Failed to fetch from hostUrl on test startup", hostUrl);
  console.error(err);
  process.exit(1);
});
