export type License = {
  type: "license";
  id: string;
  orgBillingId: string;

  env: "development" | "production";
  plan: "free" | "paid";
  hostType: "cloud" | "enterprise" | "community";

  expiresAt: number;

  maxDevices: number;
  maxServerEnvkeys: number;

  maxCloudStorageMb?: number;
  maxCloudApiCallsPerHour?: number;
  maxCloudApiCallsPerMonth?: number;
  maxCloudDataTransferPerHourMb?: number;
  maxCloudDataTransferPerMonthMb?: number;

  ssoEnabled?: true;
  teamsEnabled?: true;
  customRbacEnabled?: true;

  provisional?: true;

  createdAt: number;
  deletedAt?: number;
};
