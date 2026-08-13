import { Badge } from "@/components/ui/badge";
import { leadStatusLabels } from "@/server/validation/enums";

const variants: Record<string, "secondary" | "accent" | "outline" | "success" | "warning" | "destructive"> = {
  new: "accent",
  contacted: "secondary",
  appointment: "outline",
  showroom: "outline",
  negotiation: "warning",
  sold: "success",
  lost: "destructive",
};

export function LeadStatusBadge({ status }: { status: keyof typeof leadStatusLabels }) {
  return <Badge variant={variants[status] ?? "secondary"}>{leadStatusLabels[status]}</Badge>;
}
