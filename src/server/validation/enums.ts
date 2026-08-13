import { z } from "zod";

export const rvTypeValues = [
  "travel_trailer",
  "fifth_wheel",
  "class_a",
  "class_b",
  "class_c",
  "toy_hauler",
  "pop_up",
  "truck_camper",
  "park_model",
  "other",
] as const;
export const rvTypeSchema = z.enum(rvTypeValues);
export type RvType = z.infer<typeof rvTypeSchema>;

export const rvTypeLabels: Record<RvType, string> = {
  travel_trailer: "Travel Trailer",
  fifth_wheel: "Fifth Wheel",
  class_a: "Class A Motorhome",
  class_b: "Class B Motorhome",
  class_c: "Class C Motorhome",
  toy_hauler: "Toy Hauler",
  pop_up: "Pop-Up Camper",
  truck_camper: "Truck Camper",
  park_model: "Park Model",
  other: "Other",
};

export const rvConditionSchema = z.enum(["new", "used"]);

export const inventoryStatusSchema = z.enum(["draft", "published", "sold", "archived"]);

export const swipeDecisionSchema = z.enum(["pass", "like", "love", "more_like_this"]);

export const leadCtaTypeValues = [
  "check_availability",
  "ask_question",
  "request_best_price",
  "schedule_walkthrough",
  "estimate_trade",
  "financing_info",
] as const;
export const leadCtaTypeSchema = z.enum(leadCtaTypeValues);

export const leadCtaLabels: Record<(typeof leadCtaTypeValues)[number], string> = {
  check_availability: "Check Availability",
  ask_question: "Ask a Question",
  request_best_price: "Request Best Price",
  schedule_walkthrough: "Schedule Walkthrough",
  estimate_trade: "Estimate My Trade",
  financing_info: "Financing Information",
};

export const preferredContactMethodSchema = z.enum(["email", "phone", "text"]);

export const leadStatusValues = [
  "new",
  "contacted",
  "appointment",
  "showroom",
  "negotiation",
  "sold",
  "lost",
] as const;
export const leadStatusSchema = z.enum(leadStatusValues);

export const leadStatusLabels: Record<(typeof leadStatusValues)[number], string> = {
  new: "New",
  contacted: "Contacted",
  appointment: "Appointment",
  showroom: "Showroom Visit",
  negotiation: "Negotiation",
  sold: "Sold",
  lost: "Lost",
};

export const dealerRoleValues = ["owner", "sales_manager", "salesperson", "marketing"] as const;
export const dealerRoleSchema = z.enum(dealerRoleValues);
export type DealerRole = (typeof dealerRoleValues)[number];

export const dealerRoleLabels: Record<DealerRole, string> = {
  owner: "Owner / Admin",
  sales_manager: "Sales Manager",
  salesperson: "Salesperson",
  marketing: "Marketing User",
};

export const dealerRoleDescriptions: Record<DealerRole, string> = {
  owner: "Full access: dealership configuration, team management, all inventory, leads, sales, analytics, and pilot.",
  sales_manager: "Leads, salespeople and assignments, pipeline, sales, inventory visibility, and analytics.",
  salesperson: "Assigned leads, customer context, appointments, lead status/notes, and the sold workflow.",
  marketing: "Campaigns, distribution, and inventory-marketing analytics. No lead or customer/sale administration.",
};
