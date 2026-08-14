"use server";

import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, leadActivity, leads } from "@/server/db/schema";
import { leadFormSchema } from "@/server/validation/leads";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { trackEvent } from "@/server/analytics/track";
import { loadIntentWeights } from "@/server/recommendation/config";
import { computeIntentScore } from "@/server/recommendation/purchase-intent";
import { getDealerScopedBehaviorSnapshot } from "@/server/recommendation/profile";
import { getFirstTouchAttribution } from "@/server/attribution/first-touch";
import { sendMail } from "@/server/email/mailer";
import { escapeHtml } from "@/server/email/escape-html";
import { checkRateLimit } from "@/server/security/rate-limit";
import { formatCurrency } from "@/lib/utils";
import { leadCtaLabels } from "@/server/validation/enums";
import { notifyDealerTeam } from "@/server/notifications/dealer-fanout";
import { LEAD_WORKING_ROLES } from "@/server/dealer/permissions";

const HIGH_INTENT_NOTIFY_THRESHOLD = 70;

export type LeadFormState = { ok: false; error: string } | { ok: true };

export async function submitLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  // Honeypot: a hidden field real visitors never fill. Bots that
  // autofill every input trip this and are silently dropped.
  if (formData.get("website")) {
    return { ok: true };
  }

  const consumerProfileId = await getOrCreateConsumerProfileId();

  if (!checkRateLimit(`lead:${consumerProfileId}`, 5, 10 * 60 * 1000)) {
    return { ok: false, error: "Too many requests. Please try again in a few minutes." };
  }

  const parsed = leadFormSchema.safeParse({
    inventoryId: formData.get("inventoryId"),
    ctaType: formData.get("ctaType"),
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    preferredContact: formData.get("preferredContact"),
    message: formData.get("message") || undefined,
    consent: formData.get("consent") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const data = parsed.data;

  const [rv] = await db.select().from(inventory).where(eq(inventory.id, data.inventoryId)).limit(1);
  if (!rv) return { ok: false, error: "This RV is no longer available." };

  const [dealer] = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.id, rv.dealershipId))
    .limit(1);
  if (!dealer) return { ok: false, error: "This dealership is no longer available." };

  const intentWeights = await loadIntentWeights();
  const [intent, snapshot, attribution] = await Promise.all([
    computeIntentScore({
      consumerProfileId,
      dealershipId: dealer.id,
      ctaType: data.ctaType,
      weights: intentWeights,
    }),
    getDealerScopedBehaviorSnapshot(consumerProfileId, dealer.id),
    getFirstTouchAttribution(consumerProfileId),
  ]);

  const [lead] = await db
    .insert(leads)
    .values({
      dealershipId: dealer.id,
      inventoryId: rv.id,
      consumerProfileId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      preferredContact: data.preferredContact,
      message: data.message || null,
      ctaType: data.ctaType,
      consent: data.consent,
      intentScore: intent.score.toFixed(2),
      intentReasons: intent.reasons,
      behaviorSnapshot: snapshot,
      firstSource: attribution.firstSource,
      firstCampaignId: attribution.firstCampaignId,
    })
    .returning({ id: leads.id });

  await db.insert(leadActivity).values({
    leadId: lead.id,
    activityType: "status_change",
    fromStatus: "new",
    toStatus: "new",
    note: "Lead submitted through RV Match.",
  });

  await trackEvent({
    consumerProfileId,
    eventType: "lead_submitted",
    inventoryId: rv.id,
    dealershipId: dealer.id,
    metadata: { ctaType: data.ctaType },
  });

  // One in-app + email notification per lead to the team that actually
  // works leads (not the whole dealership roster) - typed by the most
  // significant thing true about this lead, so a genuinely hot lead reads
  // as urgent rather than getting buried as a routine "new lead" notice.
  const rvLabel = `${rv.year} ${rv.make} ${rv.model}`;
  const leadLink = `/dealer/leads/${lead.id}`;
  const notification =
    intent.score >= HIGH_INTENT_NOTIFY_THRESHOLD
      ? { type: "high_intent_lead", title: `High-intent lead: ${data.name}`, body: `${data.name} (score ${intent.score}/100) is interested in your ${rvLabel}.` }
      : data.ctaType === "schedule_walkthrough"
        ? { type: "appointment_request", title: `Walkthrough requested: ${data.name}`, body: `${data.name} requested a walkthrough for your ${rvLabel}.` }
        : { type: "new_lead", title: `New lead: ${data.name}`, body: `${data.name} used "${leadCtaLabels[data.ctaType]}" on your ${rvLabel}.` };
  await notifyDealerTeam(dealer.id, LEAD_WORKING_ROLES, { ...notification, link: leadLink });

  await sendMail({
    to: dealer.primaryContactEmail,
    subject: `New RV Match lead: ${rv.year} ${rv.make} ${rv.model}`,
    text: [
      `${data.name} used "${leadCtaLabels[data.ctaType]}" on your ${rv.year} ${rv.make} ${rv.model} (${formatCurrency(rv.advertisedPriceCents ?? rv.salePriceCents)}).`,
      "",
      `Contact: ${data.email ?? "n/a"} ${data.phone ?? ""}`,
      `Preferred contact: ${data.preferredContact}`,
      data.message ? `Message: ${data.message}` : "",
      "",
      `Purchase-intent score: ${intent.score}/100`,
      intent.reasons.length ? `Why: ${intent.reasons.join("; ")}` : "",
      "",
      `Sign in to your dealer dashboard to respond: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dealer/leads`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p><strong>${escapeHtml(data.name)}</strong> used "${escapeHtml(leadCtaLabels[data.ctaType])}" on your ${rv.year} ${escapeHtml(rv.make)} ${escapeHtml(rv.model)} (${formatCurrency(rv.advertisedPriceCents ?? rv.salePriceCents)}).</p>
      <p>Contact: ${escapeHtml(data.email ?? "n/a")} ${escapeHtml(data.phone ?? "")}<br/>Preferred contact: ${escapeHtml(data.preferredContact)}</p>
      ${data.message ? `<p>Message: ${escapeHtml(data.message)}</p>` : ""}
      <p>Purchase-intent score: <strong>${intent.score}/100</strong><br/>${escapeHtml(intent.reasons.join("; "))}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dealer/leads">Open your lead inbox</a></p>`,
  });

  return { ok: true };
}
