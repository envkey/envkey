import * as z from "zod";

export namespace V1Upgrade {
  export const UpgradeSchema = z.object({
    ts: z.number(),
    signature: z.string(),
    stripeCustomerId: z.string(),
    stripeSubscriptionId: z.string(),
    numUsers: z.number(),
    ssoEnabled: z.boolean().optional(),
    billingInterval: z.enum(["month", "year"]).optional(),
    newProductId: z.string().optional(),
    freeTier: z.boolean().optional(),
    signedPresetBilling: z.string().optional(),
  });

  export const PresetBillingSchema = z.object({
    stripeProductId: z.string(),
    billingInterval: z.enum(["month", "year"]),
    trialPeriodDays: z.number(),
  });

  export type PresetBilling = z.infer<typeof PresetBillingSchema>;

  export type Upgrade = z.infer<typeof UpgradeSchema>;
}
