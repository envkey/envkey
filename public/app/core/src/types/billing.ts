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

  ssoEnabled?: boolean;
  teamsEnabled?: boolean;
  customRbacEnabled?: boolean;

  provisional?: boolean;

  createdAt: number;
  deletedAt?: number;
};
