import { z } from "zod";

import { emailSchema, passwordSchema } from "./auth";

export const dealerApplicationSchema = z
  .object({
    dealershipName: z.string().trim().min(1, "Dealership name is required.").max(200),
    addressLine1: z.string().trim().min(1, "Address is required.").max(200),
    city: z.string().trim().min(1, "City is required.").max(100),
    state: z.string().trim().min(2, "State is required.").max(2),
    zipCode: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code."),
    phone: z.string().trim().min(7, "Phone number is required.").max(30),
    website: z.union([z.string().trim().url("Enter a valid URL."), z.literal("")]).optional(),
    primaryContactName: z.string().trim().min(1, "Contact name is required.").max(200),
    inventorySizeEstimate: z.coerce.number().int().nonnegative().optional(),
    email: emailSchema,
    password: passwordSchema,
    agreement: z.boolean(),
  })
  .refine((data) => data.agreement === true, {
    message: "You must accept the dealer agreement to apply.",
    path: ["agreement"],
  });
