import * as z from "zod";

export const TimestampsSchema = z.object({
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
});
