"use client";

import { useState } from "react";
import { CalendarCheck, HandCoins, MapPin, MessageCircle, Phone, Tag, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoPlayer, videoMilestoneToEventType } from "@/components/discovery/video-player";
import { LeadDialog } from "./lead-dialog";
import { SaveShareButtons } from "./save-share-buttons";
import { ShowMeSimilarButton } from "./show-me-similar-button";
import { formatCurrency, formatDistance } from "@/lib/utils";
import { rvTypeLabels, type RvType } from "@/server/validation/enums";
import { recordClientEvent } from "@/server/discovery/actions";

type CtaType =
  | "check_availability"
  | "ask_question"
  | "request_best_price"
  | "schedule_walkthrough"
  | "estimate_trade"
  | "financing_info";

interface RvDetailViewProps {
  rv: {
    id: string;
    year: number;
    make: string;
    model: string;
    floorplan: string | null;
    rvType: string;
    condition: "new" | "used";
    msrpCents: number | null;
    salePriceCents: number;
    advertisedPriceCents: number | null;
    lengthInches: number | null;
    dryWeightLbs: number | null;
    gvwrLbs: number | null;
    sleeps: number | null;
    slideCount: number | null;
    bunkhouse: boolean;
    toyHauler: boolean;
    outdoorKitchen: boolean;
    exteriorColor: string | null;
    description: string | null;
    city: string | null;
    state: string | null;
    stockNumber: string;
  };
  dealer: { id: string; name: string; city: string | null; state: string | null; phone: string | null } | null;
  photos: string[];
  videoUrl: string | null;
  videoCaptionUrl: string | null;
  features: string[];
  fitScore: number | null;
  explanations: string[];
  distanceMiles: number | null;
  isSaved: boolean;
}

export function RvDetailView({
  rv,
  dealer,
  photos,
  videoUrl,
  videoCaptionUrl,
  features,
  fitScore,
  explanations,
  distanceMiles,
  isSaved,
}: RvDetailViewProps) {
  const [activeMedia, setActiveMedia] = useState(0); // 0 = video, 1..n = photos
  const [leadDialog, setLeadDialog] = useState<CtaType | null>(null);

  const price = rv.advertisedPriceCents ?? rv.salePriceCents;
  const showMsrp = rv.msrpCents && rv.msrpCents > price;

  function openLead(cta: CtaType) {
    recordClientEvent("lead_started", rv.id, { ctaType: cta }).catch(() => undefined);
    setLeadDialog(cta);
  }

  function handleCallDealer() {
    recordClientEvent("call_dealer_clicked", rv.id, { dealershipId: dealer?.id }).catch(() => undefined);
  }

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="relative aspect-[9/16] w-full max-h-[70vh] overflow-hidden bg-black sm:rounded-b-2xl">
        {activeMedia === 0 && videoUrl ? (
          <VideoPlayer
            src={videoUrl}
            poster={photos[0] ?? null}
            captionSrc={videoCaptionUrl}
            active
            allowTapToPause
            className="h-full w-full"
            onMilestone={(milestone, progress) => {
              recordClientEvent(videoMilestoneToEventType(milestone), rv.id, progress && { ...progress }).catch(
                () => undefined,
              );
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photos[activeMedia === 0 ? 0 : activeMedia - 1] ?? photos[0]}
            alt={`${rv.year} ${rv.make} ${rv.model}`}
            className="h-full w-full object-cover"
          />
        )}
        {fitScore !== null && (
          <div className="absolute left-4 top-4">
            <Badge variant="accent" className="text-sm">
              {fitScore}% Match
            </Badge>
          </div>
        )}
      </div>

      {(videoUrl || photos.length > 0) && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
          {videoUrl && (
            <button
              type="button"
              onClick={() => setActiveMedia(0)}
              className={`h-16 w-10 shrink-0 rounded-md border-2 bg-black ${activeMedia === 0 ? "border-accent" : "border-transparent"}`}
              aria-label="Play video"
            />
          )}
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveMedia(i + 1)}
              className={`h-16 w-12 shrink-0 overflow-hidden rounded-md border-2 ${activeMedia === i + 1 ? "border-accent" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6 px-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={rv.condition === "new" ? "accent" : "secondary"}>
              {rv.condition === "new" ? "New" : "Used"}
            </Badge>
            <Badge variant="outline">{rvTypeLabels[rv.rvType as RvType] ?? rv.rvType}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            {rv.year} {rv.make} {rv.model}
          </h1>
          {rv.floorplan && <p className="text-muted-foreground">Floorplan {rv.floorplan}</p>}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold">{formatCurrency(price)}</span>
            {showMsrp && (
              <span className="text-muted-foreground line-through">{formatCurrency(rv.msrpCents)}</span>
            )}
          </div>
          {dealer && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                {dealer.name}
                {dealer.city && dealer.state ? ` · ${dealer.city}, ${dealer.state}` : ""}
                {distanceMiles !== null ? ` · ${formatDistance(distanceMiles)}` : ""}
              </span>
            </div>
          )}
        </div>

        {explanations.length > 0 && (
          <div className="rounded-lg bg-secondary p-3 text-sm">
            <p className="font-medium">Why we think this fits you</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {explanations.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Spec label="Sleeps" value={rv.sleeps ?? "—"} />
          <Spec label="Slides" value={rv.slideCount ?? 0} />
          <Spec label="Length" value={rv.lengthInches ? `${Math.round(rv.lengthInches / 12)} ft` : "—"} />
          <Spec label="Dry Weight" value={rv.dryWeightLbs ? `${rv.dryWeightLbs.toLocaleString()} lbs` : "—"} />
          <Spec label="GVWR" value={rv.gvwrLbs ? `${rv.gvwrLbs.toLocaleString()} lbs` : "—"} />
          <Spec label="Exterior" value={rv.exteriorColor ?? "—"} />
          <Spec label="Stock #" value={rv.stockNumber} />
          <Spec
            label="Highlights"
            value={[rv.bunkhouse && "Bunkhouse", rv.toyHauler && "Toy Hauler", rv.outdoorKitchen && "Outdoor Kitchen"]
              .filter(Boolean)
              .join(", ") || "—"}
          />
        </div>

        {features.length > 0 && (
          <div>
            <h2 className="font-medium">Features</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {features.map((f) => (
                <Badge key={f} variant="outline">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {rv.description && (
          <div>
            <h2 className="font-medium">Description</h2>
            <p className="mt-1 text-sm text-muted-foreground">{rv.description}</p>
          </div>
        )}

        <div className="space-y-2">
          <Button variant="accent" size="lg" className="w-full" onClick={() => openLead("check_availability")}>
            <Tag className="h-4 w-4" />
            Check Availability
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => openLead("ask_question")}>
              <MessageCircle className="h-4 w-4" />
              Ask a Question
            </Button>
            <Button variant="outline" onClick={() => openLead("schedule_walkthrough")}>
              <CalendarCheck className="h-4 w-4" />
              Schedule Walkthrough
            </Button>
          </div>
          <Button variant="outline" className="w-full" onClick={() => openLead("request_best_price")}>
            Request Best Price
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => openLead("estimate_trade")}>
              <Wallet className="h-4 w-4" />
              Estimate My Trade
            </Button>
            <Button variant="outline" onClick={() => openLead("financing_info")}>
              <HandCoins className="h-4 w-4" />
              Financing Info
            </Button>
          </div>
          {dealer?.phone && (
            <Button asChild variant="outline" className="w-full" onClick={handleCallDealer}>
              <a href={`tel:${dealer.phone}`}>
                <Phone className="h-4 w-4" />
                Call Dealer
              </a>
            </Button>
          )}
          <ShowMeSimilarButton inventoryId={rv.id} />
          <SaveShareButtons
            inventoryId={rv.id}
            initialSaved={isSaved}
            title={`${rv.year} ${rv.make} ${rv.model}`}
          />
        </div>
      </div>

      {(
        [
          "check_availability",
          "ask_question",
          "request_best_price",
          "schedule_walkthrough",
          "estimate_trade",
          "financing_info",
        ] as const
      ).map((cta) => (
        <LeadDialog
          key={cta}
          open={leadDialog === cta}
          onOpenChange={(open) => setLeadDialog(open ? cta : null)}
          inventoryId={rv.id}
          ctaType={cta}
          title={ctaTitles[cta]}
          description={ctaDescriptions[cta]}
        />
      ))}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

const ctaTitles: Record<CtaType, string> = {
  check_availability: "Check Availability",
  ask_question: "Ask a Question",
  request_best_price: "Request Best Price",
  schedule_walkthrough: "Schedule a Walkthrough",
  estimate_trade: "Estimate My Trade",
  financing_info: "Financing Information",
};

const ctaDescriptions: Record<CtaType, string> = {
  check_availability: "We'll confirm this RV is still available and follow up right away.",
  ask_question: "Send the dealer a question about this RV.",
  request_best_price: "Ask the dealer for their best price on this unit.",
  schedule_walkthrough: "Request an in-person or video walkthrough appointment.",
  estimate_trade: "Tell us about your current RV and the dealer will follow up with a trade-in estimate.",
  financing_info: "Ask the dealer for financing options and estimated payments on this unit.",
};
