import { Model } from "../../types";

export const getDefaultOrgSettings = (): Model.OrgSettings => ({
  auth: {
    inviteExpirationMs: 1000 * 60 * 60 * 24,
    deviceGrantExpirationMs: 1000 * 60 * 60 * 24,
    tokenExpirationMs: 1000 * 60 * 60 * 24 * 7 * 4,
  },
  crypto: {
    requiresPassphrase: false,
    requiresLockout: false,
    lockoutMs: undefined,
  },
  envs: {
    autoCaps: true,
    autoCommitLocals: false,
  },
});
