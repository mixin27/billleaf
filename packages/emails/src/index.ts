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

/** A quote, invoice, receipt or contract sent to a client, with the PDF attached. */
export function documentEmail(p: {
  to: string
  kind: "Invoice" | "Quote" | "Receipt" | "Contract"
  number: string
  workspaceName: string
  /** Formatted amount; for contracts, the contract title. */
  amount: string
  dueOrValid?: string
  message?: string | null
  replyTo?: string | null
  pdf: { filename: string; contentBase64: string }
  /** Signs the recipient into the client portal at this document. */
  portalUrl?: string | null
  /** Invoices: how to pay (one line per account). */
  paymentInstructions?: string[]
}): EmailMessage {
  const intro =
    p.kind === "Invoice"
      ? `Please find invoice ${p.number} for ${p.amount}${p.dueOrValid ? `, due ${p.dueOrValid}` : ""}.`
      : p.kind === "Contract"
        ? `Please find contract ${p.number}, "${p.amount}", for your review and signature.`
        : p.kind === "Receipt"
          ? `Thank you for your payment of ${p.amount}${p.dueOrValid ? ` received on ${p.dueOrValid}` : ""}. Receipt ${p.number} is attached.`
          : `Please find quote ${p.number} for ${p.amount}${p.dueOrValid ? `, valid until ${p.dueOrValid}` : ""}.`
  const message = p.message
    ? `<p style="white-space:pre-line">${esc(p.message)}</p>`
    : ""
  const action =
    p.kind === "Quote"
      ? "View quote"
      : p.kind === "Contract"
        ? "View contract"
        : p.kind === "Receipt"
          ? "View your account"
          : "View invoice"
  const howToPay = p.paymentInstructions?.length
    ? `<p style="margin:16px 0 4px;font-weight:600">How to pay</p><ul style="margin:0;padding-left:18px">${p.paymentInstructions
        .map((l) => `<li>${esc(l)}</li>`)
        .join(
          ""
        )}</ul>${p.portalUrl ? `<p style="font-size:13px;color:#5b6b6b">Paid already? Upload your payment screenshot online so it's confirmed quickly.</p>` : ""}`
    : ""
  const howToPayText = p.paymentInstructions?.length
    ? `\n\nHow to pay:\n${p.paymentInstructions.map((l) => `- ${l}`).join("\n")}`
    : ""
  return {
    to: p.to,
    subject: `${p.kind} ${p.number} from ${p.workspaceName}`,
    html: layout(
      `${p.kind} ${p.number}`,
      `${message}<p>${esc(intro)}</p>${howToPay}<p>The PDF is attached${p.portalUrl ? `, and you can see all your documents from ${esc(p.workspaceName)} online` : ""}.</p>`,
      p.portalUrl ? { label: action, url: p.portalUrl } : undefined
    ),
    text: `${p.message ? `${p.message}\n\n` : ""}${intro}${howToPayText}\nThe PDF is attached.${p.portalUrl ? `\n\n${action} online: ${p.portalUrl}` : ""}`,
    replyTo: p.replyTo ?? undefined,
    attachments: [{ ...p.pdf, contentType: "application/pdf" }],
  }
}

/** Client portal sign-in: one link per client the email belongs to. */
export function portalSignInEmail(p: {
  to: string
  workspaceName: string
  links: { clientName: string; url: string }[]
}): EmailMessage {
  const many = p.links.length > 1
  const list = many
    ? `<p>Your email is on more than one account. Choose one:</p><ul>${p.links
        .map(
          (l) =>
            `<li style="margin:8px 0"><a href="${esc(l.url)}">${esc(l.clientName)}</a></li>`
        )
        .join("")}</ul>`
    : ""
  return {
    to: p.to,
    subject: `Your sign-in link for ${p.workspaceName}`,
    html: layout(
      `Sign in to ${p.workspaceName}`,
      `<p>Use this link to see your quotes, contracts and invoices from ${esc(p.workspaceName)}. It works once and expires in 20 minutes.</p>${list}<p style="font-size:12px;color:#5b6b6b">If you didn't ask for this, you can ignore this email.</p>`,
      many ? undefined : { label: "Open client portal", url: p.links[0]!.url }
    ),
    text: `Sign in to ${p.workspaceName} (expires in 20 minutes):\n${p.links
      .map((l) => `${many ? `${l.clientName}: ` : ""}${l.url}`)
      .join("\n")}\n\nIf you didn't ask for this, ignore this email.`,
  }
}

/** Tells the business a client responded in the portal. */
export function portalResponseEmail(p: {
  to: string
  clientName: string
  kind: "Quote" | "Contract"
  number: string
  action: "accepted" | "declined" | "signed"
  name: string | null
  reason?: string | null
  url: string
}): EmailMessage {
  const who = p.name ? `${p.name} (${p.clientName})` : p.clientName
  const line = `${who} ${p.action} ${p.kind.toLowerCase()} ${p.number} in the client portal.`
  const reason = p.reason
    ? `<p>Their reason:</p><p style="white-space:pre-line;border-left:3px solid #d0d7d4;padding-left:12px">${esc(p.reason)}</p>`
    : ""
  return {
    to: p.to,
    subject: `${p.clientName} ${p.action} ${p.kind.toLowerCase()} ${p.number}`,
    html: layout(
      `${p.kind} ${p.number} ${p.action}`,
      `<p>${esc(line)}</p>${reason}`,
      { label: `Open ${p.kind.toLowerCase()}`, url: p.url }
    ),
    text: `${line}${p.reason ? `\n\nReason: ${p.reason}` : ""}\n\n${p.url}`,
  }
}

/** The signer's copy of a contract they e-signed in the portal. */
export function signedContractEmail(p: {
  to: string
  workspaceName: string
  number: string
  title: string
  signedByName: string
  pdf: { filename: string; contentBase64: string }
}): EmailMessage {
  const line = `You signed contract ${p.number}, "${p.title}", with ${p.workspaceName} as ${p.signedByName}. Your signed copy, with its signature certificate, is attached.`
  return {
    to: p.to,
    subject: `Signed: ${p.title} (${p.number})`,
    html: layout(`Contract ${p.number} signed`, `<p>${esc(line)}</p>`),
    text: line,
    attachments: [{ ...p.pdf, contentType: "application/pdf" }],
  }
}

/** Tells the business a client says they've paid (with a screenshot). */
export function paymentProofSubmittedEmail(p: {
  to: string
  clientName: string
  invoiceNumber: string
  amount: string
  reference?: string | null
  url: string
}): EmailMessage {
  const line = `${p.clientName} says they paid ${p.amount} for invoice ${p.invoiceNumber}${p.reference ? ` (reference ${p.reference})` : ""}. Check the screenshot and confirm it to record the payment and send a receipt.`
  return {
    to: p.to,
    subject: `${p.clientName} paid invoice ${p.invoiceNumber}: please confirm`,
    html: layout(`Payment to confirm`, `<p>${esc(line)}</p>`, {
      label: "Review payment",
      url: p.url,
    }),
    text: `${line}\n\n${p.url}`,
  }
}

/** Tells the client their proof of payment wasn't accepted, and why. */
export function paymentProofRejectedEmail(p: {
  to: string
  workspaceName: string
  invoiceNumber: string
  amount: string
  reason: string
  url: string
}): EmailMessage {
  const line = `${p.workspaceName} couldn't confirm your payment of ${p.amount} for invoice ${p.invoiceNumber}.`
  return {
    to: p.to,
    subject: `Payment for invoice ${p.invoiceNumber} needs another look`,
    html: layout(
      `Payment not confirmed`,
      `<p>${esc(line)}</p><p>Their note:</p><p style="white-space:pre-line;border-left:3px solid #d0d7d4;padding-left:12px">${esc(p.reason)}</p><p>You can upload a new screenshot from the invoice page.</p>`,
      { label: "Open invoice", url: p.url }
    ),
    text: `${line}\n\nTheir note: ${p.reason}\n\nUpload a new screenshot: ${p.url}`,
  }
}

// ── Manual subscriptions (ADR-0013) ───────────────────────────

/** To platform admins: a workspace uploaded proof for a plan. */
export function subscriptionPaymentSubmittedEmail(p: {
  to: string
  workspaceName: string
  plan: string
  amount: string
  reference: string | null
  url: string
}): EmailMessage {
  const line = `${p.workspaceName} paid ${p.amount} for ${p.plan}${p.reference ? ` (ref ${p.reference})` : ""}.`
  return {
    to: p.to,
    subject: `Subscription payment to review: ${p.workspaceName}`,
    html: layout(
      `Payment to review`,
      `<p>${esc(line)}</p><p>Check the screenshot, then approve or reject it.</p>`,
      { label: "Review payment", url: p.url }
    ),
    text: `${line}\n\nReview it: ${p.url}`,
  }
}

/** To workspace owners: the payment was approved and the plan is active. */
export function subscriptionApprovedEmail(p: {
  to: string
  workspaceName: string
  plan: string
  until: string
  url: string
}): EmailMessage {
  const line = `Your payment was approved. ${p.workspaceName} is on ${p.plan} until ${p.until}.`
  return {
    to: p.to,
    subject: `${p.plan} is active for ${p.workspaceName}`,
    html: layout(`Payment approved`, `<p>${esc(line)}</p>`, {
      label: "Open billing",
      url: p.url,
    }),
    text: `${line}\n\n${p.url}`,
  }
}

/** To workspace owners: the payment couldn't be matched. */
export function subscriptionRejectedEmail(p: {
  to: string
  workspaceName: string
  plan: string
  amount: string
  reason: string
  url: string
}): EmailMessage {
  const line = `We couldn't confirm the ${p.amount} payment for ${p.plan} on ${p.workspaceName}.`
  return {
    to: p.to,
    subject: `Your ${p.plan} payment needs another look`,
    html: layout(
      `Payment not approved`,
      `<p>${esc(line)}</p><p>Our note:</p><p style="white-space:pre-line;border-left:3px solid #d0d7d4;padding-left:12px">${esc(p.reason)}</p><p>You can upload a new screenshot from the billing page.</p>`,
      { label: "Open billing", url: p.url }
    ),
    text: `${line}\n\nOur note: ${p.reason}\n\nUpload a new screenshot: ${p.url}`,
  }
}

/** To workspace owners: renewal reminders and the end of the plan. */
export function subscriptionReminderEmail(p: {
  to: string
  workspaceName: string
  plan: string
  stage: "7d" | "1d" | "ended"
  /** Period end (7d/1d) or the end of the grace period (ended). */
  date: string
  url: string
}): EmailMessage {
  const line =
    p.stage === "ended"
      ? `${p.workspaceName}'s ${p.plan} plan has ended. It keeps working until ${p.date}; after that the workspace moves to Free limits. Nothing is deleted.`
      : `${p.workspaceName}'s ${p.plan} plan ends on ${p.date}. Renew to keep your ${p.plan} features.`
  const subject =
    p.stage === "ended"
      ? `Your ${p.plan} plan has ended`
      : p.stage === "1d"
        ? `Your ${p.plan} plan ends tomorrow`
        : `Your ${p.plan} plan ends in 7 days`
  return {
    to: p.to,
    subject,
    html: layout(subject, `<p>${esc(line)}</p>`, {
      label: "Renew",
      url: p.url,
    }),
    text: `${line}\n\nRenew: ${p.url}`,
  }
}

/** Automatic payment reminder for an unpaid invoice (no attachment). */
export function invoiceReminderEmail(p: {
  to: string
  workspaceName: string
  number: string
  /** Formatted amount still due. */
  amountDue: string
  /** Formatted due date. */
  dueDate: string
  /** Days relative to the due date (negative = before). */
  offsetDays: number
  portalUrl: string
  paymentInstructions?: string[]
  replyTo?: string | null
}): EmailMessage {
  const late = p.offsetDays > 0
  const subject =
    p.offsetDays < 0
      ? `Reminder: invoice ${p.number} is due on ${p.dueDate}`
      : p.offsetDays === 0
        ? `Invoice ${p.number} is due today`
        : `Invoice ${p.number} is overdue`
  const intro =
    p.offsetDays < 0
      ? `A friendly reminder that invoice ${p.number} from ${p.workspaceName} for ${p.amountDue} is due on ${p.dueDate}.`
      : p.offsetDays === 0
        ? `Invoice ${p.number} from ${p.workspaceName} for ${p.amountDue} is due today.`
        : `Invoice ${p.number} from ${p.workspaceName} was due on ${p.dueDate}. ${p.amountDue} is still outstanding.`
  const howToPay = p.paymentInstructions?.length
    ? `<p style="margin:16px 0 4px;font-weight:600">How to pay</p><ul style="margin:0;padding-left:18px">${p.paymentInstructions
        .map((l) => `<li>${esc(l)}</li>`)
        .join("")}</ul>`
    : ""
  const howToPayText = p.paymentInstructions?.length
    ? `\n\nHow to pay:\n${p.paymentInstructions.map((l) => `- ${l}`).join("\n")}`
    : ""
  const already =
    "Already paid? Thank you — you can ignore this, or upload your payment screenshot online so it's confirmed."
  return {
    to: p.to,
    subject,
    html: layout(
      late ? "Payment overdue" : "Payment reminder",
      `<p>${esc(intro)}</p>${howToPay}<p style="font-size:13px;color:#5b6b6b">${esc(already)}</p>`,
      { label: "View invoice", url: p.portalUrl }
    ),
    text: `${intro}${howToPayText}\n\n${already}\n\nView invoice: ${p.portalUrl}`,
    replyTo: p.replyTo ?? undefined,
  }
}

/** The full data export (CSVs + PDFs) is ready to download. */
export function dataExportReadyEmail(p: {
  to: string
  workspaceName: string
  url: string
  /** Formatted date the link stops working. */
  expires: string
  documents: number
}): EmailMessage {
  const line = `Your export of ${p.workspaceName} is ready: all records as spreadsheets, plus ${p.documents} document PDF${p.documents === 1 ? "" : "s"}.`
  const note = `The link works until ${p.expires}. Anyone with it can download the file, so don't forward this email.`
  return {
    to: p.to,
    subject: `Your ${p.workspaceName} export is ready`,
    html: layout(
      "Your export is ready",
      `<p>${esc(line)}</p><p style="font-size:13px;color:#5b6b6b">${esc(note)}</p>`,
      { label: "Download ZIP", url: p.url }
    ),
    text: `${line}\n\nDownload: ${p.url}\n\n${note}`,
  }
}
