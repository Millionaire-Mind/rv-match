"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rvTypeLabels, rvTypeValues } from "@/server/validation/enums";
import type { InventoryFormState } from "@/server/dealer/inventory-actions";

type InventoryDefaults = Partial<{
  stockNumber: string;
  vin: string;
  year: number;
  make: string;
  brand: string;
  model: string;
  floorplan: string;
  rvType: string;
  condition: "new" | "used";
  msrpCents: number | null;
  salePriceCents: number;
  advertisedPriceCents: number | null;
  lengthInches: number | null;
  widthInches: number | null;
  heightInches: number | null;
  dryWeightLbs: number | null;
  gvwrLbs: number | null;
  hitchWeightLbs: number | null;
  sleeps: number | null;
  slideCount: number | null;
  bedConfiguration: string;
  bunkhouse: boolean;
  toyHauler: boolean;
  outdoorKitchen: boolean;
  exteriorColor: string;
  interior: string;
  description: string;
  city: string;
  state: string;
  zipCode: string;
  features: string;
  canonicalUrl: string;
}>;

interface InventoryFormProps {
  action: (state: InventoryFormState, formData: FormData) => Promise<InventoryFormState>;
  defaults?: InventoryDefaults;
  submitLabel: string;
}

const initialState: InventoryFormState = { ok: false, error: "" };

export function InventoryForm({ action, defaults, submitLabel }: InventoryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Stock Number" name="stockNumber" defaultValue={defaults?.stockNumber} required />
        <Field label="VIN" name="vin" defaultValue={defaults?.vin} />
        <Field label="Year" name="year" type="number" defaultValue={defaults?.year} required />
        <Field label="Make (manufacturer)" name="make" defaultValue={defaults?.make} placeholder="Forest River" required />
        <Field label="Brand" name="brand" defaultValue={defaults?.brand} placeholder="Rockwood" required />
        <Field label="Model" name="model" defaultValue={defaults?.model} required />
        <Field label="Floorplan" name="floorplan" defaultValue={defaults?.floorplan} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rvType">RV Type</Label>
          <Select name="rvType" defaultValue={defaults?.rvType ?? "travel_trailer"}>
            <SelectTrigger id="rvType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rvTypeValues.map((t) => (
                <SelectItem key={t} value={t}>
                  {rvTypeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="condition">Condition</Label>
          <Select name="condition" defaultValue={defaults?.condition ?? "used"}>
            <SelectTrigger id="condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="used">Used</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field
          label="MSRP ($)"
          name="msrp"
          type="number"
          defaultValue={defaults?.msrpCents ? defaults.msrpCents / 100 : undefined}
        />
        <Field
          label="Sale Price ($)"
          name="salePrice"
          type="number"
          defaultValue={defaults?.salePriceCents ? defaults.salePriceCents / 100 : undefined}
          required
        />
        <Field
          label="Advertised Price ($)"
          name="advertisedPrice"
          type="number"
          defaultValue={defaults?.advertisedPriceCents ? defaults.advertisedPriceCents / 100 : undefined}
        />
        <Field
          label="Length (ft)"
          name="lengthFeet"
          type="number"
          defaultValue={defaults?.lengthInches ? Math.round(defaults.lengthInches / 12) : undefined}
        />
        <Field label="Width (in)" name="widthInches" type="number" defaultValue={defaults?.widthInches ?? undefined} />
        <Field label="Height (in)" name="heightInches" type="number" defaultValue={defaults?.heightInches ?? undefined} />
        <Field label="Dry Weight (lbs)" name="dryWeightLbs" type="number" defaultValue={defaults?.dryWeightLbs ?? undefined} />
        <Field label="GVWR (lbs)" name="gvwrLbs" type="number" defaultValue={defaults?.gvwrLbs ?? undefined} />
        <Field label="Hitch Weight (lbs)" name="hitchWeightLbs" type="number" defaultValue={defaults?.hitchWeightLbs ?? undefined} />
        <Field label="Sleeps" name="sleeps" type="number" defaultValue={defaults?.sleeps ?? undefined} />
        <Field label="Slide Count" name="slideCount" type="number" defaultValue={defaults?.slideCount ?? undefined} />
        <Field label="Bed Configuration" name="bedConfiguration" defaultValue={defaults?.bedConfiguration} />
        <Field label="Exterior Color" name="exteriorColor" defaultValue={defaults?.exteriorColor} />
        <Field label="Interior" name="interior" defaultValue={defaults?.interior} />
      </div>

      <div className="flex flex-wrap gap-6">
        <CheckField label="Bunkhouse" name="bunkhouse" defaultChecked={defaults?.bunkhouse} />
        <CheckField label="Toy Hauler" name="toyHauler" defaultChecked={defaults?.toyHauler} />
        <CheckField label="Outdoor Kitchen" name="outdoorKitchen" defaultChecked={defaults?.outdoorKitchen} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="City" name="city" defaultValue={defaults?.city} />
        <Field label="State" name="state" defaultValue={defaults?.state} maxLength={2} />
        <Field label="ZIP" name="zipCode" defaultValue={defaults?.zipCode} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="features">Features (comma-separated)</Label>
        <Input id="features" name="features" defaultValue={defaults?.features} placeholder="Outdoor Kitchen, Bunkhouse, Solar Prep" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={defaults?.description} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="canonicalUrl">Source/canonical URL (optional)</Label>
        <Input
          id="canonicalUrl"
          name="canonicalUrl"
          type="url"
          defaultValue={defaults?.canonicalUrl}
          placeholder="https://yourdealership.com/inventory/this-rv"
        />
        <p className="text-xs text-muted-foreground">
          The original listing on your own website, if you have one.
        </p>
      </div>

      {!state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="accent" size="lg" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={name} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={name} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
