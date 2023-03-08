import * as z from "zod";
import { TimestampsSchema } from "./timestamps";

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

export const PlanTypeSchema = z.enum([
  "cloud_basics",
  "cloud_pro",
  "business_cloud",
  "enterprise",
]);
export type PlanType = z.infer<typeof PlanTypeSchema>;

export const ProductSchema = z
  .object({
    type: z.literal("product"),
    id: z.string(),
    plan: PlanTypeSchema,

    name: z.string(),

    maxUsers: z.number(),
    maxEnvkeyWatchers: z.number(),
    adjustableQuantity: z.boolean().optional(),

    ssoEnabled: z.boolean().optional(),
    teamsEnabled: z.boolean().optional(),
    customRbacEnabled: z.boolean().optional(),

    isCloudBasics: z.boolean(),
  })
  .merge(TimestampsSchema);
export type Product = z.infer<typeof ProductSchema>;

export const PriceSchema = z
  .object({
    type: z.literal("price"),
    id: z.string(),
    name: z.string(),
    productId: z.string(),
    interval: z.enum(["month", "year"]),
    amount: z.number(),
  })
  .merge(TimestampsSchema);
export type Price = z.infer<typeof PriceSchema>;

export const CustomerSchema = z
  .object({
    type: z.literal("customer"),
    id: z.string(),
    billingEmail: z.string(),
  })
  .merge(TimestampsSchema);
export type Customer = z.infer<typeof CustomerSchema>;

export const SubscriptionSchema = z
  .object({
    type: z.literal("subscription"),
    id: z.string(),
    productId: z.string(),
    priceId: z.string(),
    quantity: z.number(),
    status: z.enum([
      "trialing",
      "incomplete",
      "incomplete_expired",
      "active",
      "past_due",
      "canceled",
      "unpaid",
    ]),
    canceledAt: z.number().optional(),
    currentPeriodStartsAt: z.number().optional(),
    currentPeriodEndsAt: z.number().optional(),
    hasPromotionCode: z.boolean().optional(),
    amountOff: z.number().optional(),
    percentOff: z.number().optional(),
  })
  .merge(TimestampsSchema);
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const InvoiceSchema = z
  .object({
    type: z.literal("invoice"),
    id: z.string(),
    productId: z.string(),
    productName: z.string(),
    priceId: z.string(),
    subscriptionId: z.string(),
    stripeId: z.string(),
    stripeChargeId: z.string().optional(),
    amountDue: z.number(),
    numActiveUsers: z.number(),
    maxUsers: z.number(),
    attemptCount: z.number(),
    attempted: z.boolean(),
    status: z
      .enum(["deleted", "draft", "open", "paid", "uncollectible", "void"])
      .optional(),
    nextPaymentAttempt: z.number().optional(),
    paid: z.boolean(),
    periodStart: z.number(),
    periodEnd: z.number(),
    periodString: z.string(),
    refNumber: z.string().optional(),
    subtotal: z.number(),
    total: z.number(),
    tax: z.number().optional(),
    amountRefunded: z.number().optional(),
    html: z.string().optional(),
  })
  .merge(TimestampsSchema);
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaymentSourceSchema = z
  .object({
    type: z.literal("paymentSource"),
    id: z.string(),
    paymentType: z.literal("card"),
    brand: z.string().optional(),
    last4: z.string().optional(),
    expMonth: z.number().optional(),
    expYear: z.number().optional(),
  })
  .merge(TimestampsSchema);

export type PaymentSource = z.infer<typeof PaymentSourceSchema>;

export const BillingSettingsSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  vat: z.string().optional(),
});
export type BillingSettings = z.infer<typeof BillingSettingsSchema>;
