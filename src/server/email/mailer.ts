import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function hasRealSmtp(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Sends an email via SMTP when SMTP_HOST is configured. Otherwise — the
 * default in this environment — writes the composed message to
 * ./local-mail/*.json and logs it, so nothing is silently dropped and
 * nothing pretends to have sent a real email (see IMPLEMENTATION_PLAN.md
 * "Known technical risks").
 */
export async function sendMail(params: SendMailParams): Promise<void> {
  if (hasRealSmtp()) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || "RV Match <no-reply@rvmatch.app>",
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return;
  }

  const dir = path.join(process.cwd(), "local-mail");
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${params.to.replace(/[^a-z0-9]/gi, "_")}.json`;
  await writeFile(
    path.join(dir, filename),
    JSON.stringify({ to: params.to, subject: params.subject, html: params.html, text: params.text }, null, 2),
  );
  console.log(`[dev-mail] "${params.subject}" -> ${params.to} (saved to local-mail/${filename})`);
}
