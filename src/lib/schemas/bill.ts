import { z } from "zod";

export const billSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Valid date required"),
    vendor: z.string().min(1, "Vendor required"),
    description: z.string().default(""),
    filename: z.string().default(""),
    postings: z
      .array(
        z.object({
          account: z.string().min(1, "Account required"),
          amount: z.string().min(1, "Amount required"),
        }),
      )
      .min(1, "At least one posting required"),
    paid: z.boolean().default(false),
    payAccount: z.string().default(""),
  })
  .refine((d) => !d.paid || d.payAccount.length > 0, {
    message: "Payment account required",
    path: ["payAccount"],
  });
