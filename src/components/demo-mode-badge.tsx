import { Badge } from "@/components/ui/badge";

/** Visible only when NEXT_PUBLIC_DEMO_MODE=true — see .env.example. */
export function DemoModeBadge() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;
  return (
    <Badge variant="warning" className="w-fit">
      Demo data
    </Badge>
  );
}
