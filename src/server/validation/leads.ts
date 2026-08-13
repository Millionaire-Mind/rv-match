import { z } from "zod";

import { leadCtaTypeSchema, preferredContactMethodSchema } from "./enums";

export const leadFormSchema = z
  .object({
    inventoryId: z.uuid(),
    ctaType: leadCtaTypeSchema,
    name: z.string().trim().min(1, "Enter your name.").max(200),
    email: z.union([z.string().trim().email("Enter a valid email."), z.literal("")]).optional(),
    phone: z.string().trim().max(40).optional(),
    preferredContact: preferredContactMethodSchema,
    message: z.string().trim().max(2000).optional(),
    consent: z.boolean(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Provide an email or phone number.",
    path: ["email"],
  })
  .refine((data) => data.consent === true, {
    message: "Please agree to be contacted about this RV.",
    path: ["consent"],
  });

export type LeadFormInput = z.infer<typeof leadFormSchema>;
