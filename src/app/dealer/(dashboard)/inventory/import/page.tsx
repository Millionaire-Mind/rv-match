import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { requireDealerContext } from "@/server/dealer/context";
import { CsvImportForm } from "@/components/dealer/csv-import-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Import Inventory" };

export default async function ImportInventoryPage() {
  const { dealership } = await requireDealerContext();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Import Inventory (CSV)</h1>
      <p className="text-sm text-muted-foreground">
        Re-importing a file with the same stock numbers updates those RVs instead of creating
        duplicates. Rows are validated individually — a bad row is reported, not silently dropped,
        and doesn&apos;t block the rest of the file.
      </p>
      <Button asChild variant="outline">
        <Link href="/api/dealer/csv-template">
          <Download className="h-4 w-4" />
          Download CSV Template
        </Link>
      </Button>
      <CsvImportForm dealershipId={dealership.id} />
    </div>
  );
}
