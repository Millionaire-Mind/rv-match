import type { Metadata } from "next";

import { requireDealerContext } from "@/server/dealer/context";
import { InventoryForm } from "@/components/dealer/inventory-form";
import { createInventory, type InventoryFormState } from "@/server/dealer/inventory-actions";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Add RV" };

export default async function NewInventoryPage() {
  const { dealership } = await requireDealerContext();

  async function action(_prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
    "use server";
    const result = await createInventory(dealership.id, _prev, formData);
    if (result.ok) redirect(`/dealer/inventory/${result.inventoryId}`);
    return result;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Add RV</h1>
      <InventoryForm action={action} submitLabel="Create RV" />
    </div>
  );
}
