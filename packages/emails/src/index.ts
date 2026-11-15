/**
 * Email templates. Each returns a transport-agnostic message the API enqueues
 * and the worker delivers. Keep copy short, direct and on-brand.
 *
 * TODO(phase-1): replace string templates with react-email components once
 * brand typography/colors are final.
 */
export interface EmailAttachment {
  filename: string
  /** Base64 so the message stays JSON-serialisable in the job queue. */
  contentBase64: string
  contentType: string
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  attachments?: EmailAttachment[]
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function layout(
  title: string,
  body: string,
  cta?: { label: string; url: string }
) {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#142B2B;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(cta.label)}</a></p>`
    : ""
  return `<!doctype html><html><body style="margin:0;background:#F8FAF8;font-family:Inter,Arial,sans-serif;color:#142B2B">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-weight:600;font-size:18px;margin:0 0 24px">billleaf</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${body}${button}
<p style="font-size:12px;color:#5b6b6b;margin-top:32px">Your work. Your business. One place.</p>
</div></body></html>`
}

export function verifyEmail(p: {
  to: string
  name: string
  url: string
}): EmailMessage {
  return {
    to: p.to,
    subject: "Verify your email for Billleaf",
    html: layout(
      `Welcome, ${p.name}`,
      `<p>Confirm your email address to finish setting up your account.</p>`,
      { label: "Verify email", url: p.url }
    ),
    text: `Welcome, ${p.name}. Verify your email: ${p.url}`,
  }
}

export function resetPasswordEmail(p: {
  to: string
  name: string
  url: string
}): EmailMessage {
  return {
    to: p.to,
    subject: "Reset your Billleaf password",
    html: layout(
      "Reset your password",
      `<p>Hi ${esc(p.name)}, use the button below to choose a new password. If you didn't request this, you can ignore this email.</p>`,
      { label: "Reset password", url: p.url }
    ),
    text: `Reset your password: ${p.url}`,
  }
}

export function magicLinkEmail(p: { to: string; url: string }): EmailMessage {
  return {
    to: p.to,
    subject: "Your Billleaf sign-in link",
    html: layout("Sign in to Billleaf", `<p>This link expires shortly.</p>`, {
      label: "Sign in",
      url: p.url,
    }),
    text: `Sign in to Billleaf: ${p.url}`,
  }
}

export function invitationEmail(p: {
  to: string
  workspaceName: string
  inviterName: string
  url: string
}): EmailMessage {
  return {
    to: p.to,
    subject: `${p.inviterName} invited you to ${p.workspaceName} on Billleaf`,
    html: layout(
      `Join ${p.workspaceName}`,
      `<p>${esc(p.inviterName)} invited you to collaborate in <strong>${esc(p.workspaceName)}</strong>.</p>`,
      { label: "Accept invitation", url: p.url }
    ),
    text: `${p.inviterName} invited you to ${p.workspaceName}: ${p.url}`,
  }
}

/** A quote or invoice sent to a client, with the PDF attached. */
export function documentEmail(p: {
  to: string
  kind: "Invoice" | "Quote"
  number: string
  workspaceName: string
  amount: string
  dueOrValid?: string
  message?: string | null
  replyTo?: string | null
  pdf: { filename: string; contentBase64: string }
}): EmailMessage {
  const intro =
    p.kind === "Invoice"
      ? `Please find invoice ${p.number} for ${p.amount}${p.dueOrValid ? `, due ${p.dueOrValid}` : ""}.`
      : `Please find quote ${p.number} for ${p.amount}${p.dueOrValid ? `, valid until ${p.dueOrValid}` : ""}.`
  const message = p.message
    ? `<p style="white-space:pre-line">${esc(p.message)}</p>`
    : ""
  return {
    to: p.to,
    subject: `${p.kind} ${p.number} from ${p.workspaceName}`,
    html: layout(
      `${p.kind} ${p.number}`,
      `${message}<p>${esc(intro)}</p><p>The PDF is attached.</p>`
    ),
    text: `${p.message ? `${p.message}\n\n` : ""}${intro}\nThe PDF is attached.`,
    replyTo: p.replyTo ?? undefined,
    attachments: [{ ...p.pdf, contentType: "application/pdf" }],
  }
}
