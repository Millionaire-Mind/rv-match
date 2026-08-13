import { CSV_TEMPLATE_HEADERS } from "@/server/validation/inventory";

const EXAMPLE_ROW = [
  "RV-2001",
  "1GAV1234ABC567890",
  "2024",
  "Forest River",
  "Rockwood",
  "2715S",
  "travel_trailer",
  "new",
  "44900",
  "38900",
  "38900",
  "31",
  "102",
  "132",
  "6100",
  "7800",
  "650",
  "6",
  "1",
  "Queen + Bunks",
  "true",
  "false",
  "true",
  "Alpine White",
  "Beige",
  "A bunkhouse travel trailer with a full outdoor kitchen.",
  "Denver",
  "CO",
  "80202",
  "Outdoor Kitchen,Bunkhouse,Solar Prep",
];

export async function GET() {
  const csv = [CSV_TEMPLATE_HEADERS.join(","), EXAMPLE_ROW.join(",")].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="rv-match-inventory-template.csv"',
    },
  });
}
