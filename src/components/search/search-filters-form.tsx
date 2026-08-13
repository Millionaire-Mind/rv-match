"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rvTypeLabels, rvTypeValues } from "@/server/validation/enums";

/**
 * "I Know What I Want" filter form. Filters live entirely in the URL
 * (searchInventory reads them server-side), so results are shareable/
 * bookmarkable and the page works without JS for the initial render.
 */
export function SearchFiltersForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  // Radix's Select/Checkbox primitives render as <button>-based custom
  // elements, not native <select>/<input>, so they never participate in a
  // native <form>'s FormData submission on their own. Track them as
  // controlled state and mirror each into a real hidden <input> that does.
  const [rvType, setRvType] = useState(searchParams.get("rvType") ?? "");
  const [condition, setCondition] = useState(searchParams.get("condition") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "newest");
  const [bunkhouse, setBunkhouse] = useState(searchParams.get("bunkhouse") === "true");
  const [toyHauler, setToyHauler] = useState(searchParams.get("toyHauler") === "true");
  const [outdoorKitchen, setOutdoorKitchen] = useState(searchParams.get("outdoorKitchen") === "true");

  function submit(formData: FormData) {
    setPending(true);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const str = typeof value === "string" ? value.trim() : "";
      if (str) params.set(key, str);
    }
    router.push(`/search?${params.toString()}`);
    setPending(false);
  }

  return (
    <form action={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="rvType">Type</Label>
          <input type="hidden" name="rvType" value={rvType} />
          <Select value={rvType} onValueChange={setRvType}>
            <SelectTrigger id="rvType">
              <SelectValue placeholder="Any type" />
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
        <div>
          <Label htmlFor="make">Manufacturer</Label>
          <Input id="make" name="make" defaultValue={searchParams.get("make") ?? ""} placeholder="Forest River" />
        </div>
        <div>
          <Label htmlFor="model">Model</Label>
          <Input id="model" name="model" defaultValue={searchParams.get("model") ?? ""} placeholder="Rockwood" />
        </div>
        <div>
          <Label htmlFor="condition">Condition</Label>
          <input type="hidden" name="condition" value={condition} />
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger id="condition">
              <SelectValue placeholder="New or used" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="used">Used</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="yearMin">Year (min)</Label>
          <Input id="yearMin" name="yearMin" type="number" defaultValue={searchParams.get("yearMin") ?? ""} />
        </div>
        <div>
          <Label htmlFor="yearMax">Year (max)</Label>
          <Input id="yearMax" name="yearMax" type="number" defaultValue={searchParams.get("yearMax") ?? ""} />
        </div>
        <div>
          <Label htmlFor="priceMin">Price (min $)</Label>
          <Input id="priceMin" name="priceMin" type="number" defaultValue={searchParams.get("priceMin") ?? ""} />
        </div>
        <div>
          <Label htmlFor="priceMax">Price (max $)</Label>
          <Input id="priceMax" name="priceMax" type="number" defaultValue={searchParams.get("priceMax") ?? ""} />
        </div>
        <div>
          <Label htmlFor="lengthMinFeet">Length (min ft)</Label>
          <Input id="lengthMinFeet" name="lengthMinFeet" type="number" defaultValue={searchParams.get("lengthMinFeet") ?? ""} />
        </div>
        <div>
          <Label htmlFor="lengthMaxFeet">Length (max ft)</Label>
          <Input id="lengthMaxFeet" name="lengthMaxFeet" type="number" defaultValue={searchParams.get("lengthMaxFeet") ?? ""} />
        </div>
        <div>
          <Label htmlFor="sleepsMin">Sleeps (min)</Label>
          <Input id="sleepsMin" name="sleepsMin" type="number" defaultValue={searchParams.get("sleepsMin") ?? ""} />
        </div>
        <div>
          <Label htmlFor="dryWeightMaxLbs">Dry weight (max lbs)</Label>
          <Input id="dryWeightMaxLbs" name="dryWeightMaxLbs" type="number" defaultValue={searchParams.get("dryWeightMaxLbs") ?? ""} />
        </div>
        <div>
          <Label htmlFor="zipCode">ZIP code</Label>
          <Input id="zipCode" name="zipCode" defaultValue={searchParams.get("zipCode") ?? ""} placeholder="80202" />
        </div>
        <div>
          <Label htmlFor="radiusMiles">Radius (miles)</Label>
          <Input id="radiusMiles" name="radiusMiles" type="number" defaultValue={searchParams.get("radiusMiles") ?? ""} placeholder="100" />
        </div>
        <div>
          <Label htmlFor="sort">Sort by</Label>
          <input type="hidden" name="sort" value={sort} />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger id="sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="bunkhouse" value={bunkhouse ? "true" : ""} />
          <Checkbox checked={bunkhouse} onCheckedChange={(v) => setBunkhouse(v === true)} />
          Bunkhouse
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="toyHauler" value={toyHauler ? "true" : ""} />
          <Checkbox checked={toyHauler} onCheckedChange={(v) => setToyHauler(v === true)} />
          Toy Hauler
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="outdoorKitchen" value={outdoorKitchen ? "true" : ""} />
          <Checkbox checked={outdoorKitchen} onCheckedChange={(v) => setOutdoorKitchen(v === true)} />
          Outdoor Kitchen
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          Search
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setRvType("");
            setCondition("");
            setSort("newest");
            setBunkhouse(false);
            setToyHauler(false);
            setOutdoorKitchen(false);
            router.push("/search");
          }}
        >
          Clear filters
        </Button>
      </div>
    </form>
  );
}
