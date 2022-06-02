export type License = {
  type: "license";
  id: string;
  orgBillingId: string;

  env: "development" | "production";
  plan: "free" | "paid";

  isCloudEssentials?: boolean; // old plan: now split into 'basics' and 'pro'
  isCloudBasics?: boolean;

  hostType: "cloud" | "enterprise" | "community";

  expiresAt: number;

  maxUsers?: number; // optional for backward compatibility
  maxDevices: number;
  maxServerEnvkeys: number;

  maxCloudStorageMb?: number;
  maxCloudApiCallsPerHour?: number;
  maxCloudApiCallsPerMonth?: number;
  maxCloudDataTransferPerHourMb?: number;
  maxCloudDataTransferPerDayMb?: number;
  maxCloudDataTransferPerMonthMb?: number;
  maxCloudActiveSocketConnections?: number;
  cloudLogRetentionDays?: number;

  provisional?: boolean;

  createdAt: number;
  deletedAt?: number;
};
