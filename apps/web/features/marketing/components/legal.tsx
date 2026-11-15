import Link from "next/link"

import { siteConfig } from "@/config/site"

function Contact() {
  return siteConfig.supportEmail ? (
    <a className="underline" href={`mailto:${siteConfig.supportEmail}`}>
      {siteConfig.supportEmail}
    </a>
  ) : (
    <>the contact address shown in the app</>
  )
}

function LegalPage({
  title,
  intro,
  children,
}: {
  title: string
  intro: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-14 text-sm leading-relaxed sm:px-6 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">
          Last updated {siteConfig.legalUpdated}
        </p>
      </header>
      <p>{intro}</p>
      {children}
    </article>
  )
}

/** /terms */
export function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <>
          These terms apply when you use {siteConfig.name} (&quot;we&quot;,
          &quot;us&quot;) to run your work: clients, quotes, contracts,
          projects, time, invoices and payments. By creating an account you
          agree to them. If you use {siteConfig.name} for a business, you agree
          on its behalf.
        </>
      }
    >
      <h2>Your account and workspace</h2>
      <ul>
        <li>
          Give accurate details, keep your password safe, and tell us if you
          think someone else is using your account. Turn on two-factor
          authentication for extra protection.
        </li>
        <li>
          A workspace belongs to its owners. Owners decide who joins, what each
          member can do, and can export or delete the workspace.
        </li>
        <li>You must be old enough to enter a contract where you live.</li>
      </ul>

      <h2>Your content</h2>
      <ul>
        <li>
          Everything you put in {siteConfig.name} — clients, documents, files,
          time entries — stays yours. You give us permission to store, process
          and show it only to run the service for you (for example, to make a
          PDF or email an invoice to your client).
        </li>
        <li>
          You&apos;re responsible for what you send through {siteConfig.name},
          for having the right to use your clients&apos; details, and for your
          invoices, taxes and contracts being correct for your country. We
          don&apos;t give legal, tax or accounting advice.
        </li>
        <li>
          Issued invoices and receipts can&apos;t be edited, only voided or
          credited, so your records stay consistent.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Don&apos;t use {siteConfig.name} for anything illegal, to send spam or
          fake invoices, to impersonate others, or to break into or overload the
          service.
        </li>
        <li>
          We may suspend an account that breaks these rules or puts other people
          at risk. Where we reasonably can, we&apos;ll tell you why and give you
          a chance to fix it.
        </li>
      </ul>

      <h2>Plans and payment</h2>
      <ul>
        <li>
          The Free plan is free, with the limits shown on the{" "}
          <Link className="underline" href="/pricing">
            pricing page
          </Link>
          . Paid plans are paid in advance for the period you choose.
        </li>
        <li>
          When you pay by bank transfer or mobile wallet, your plan starts once
          we&apos;ve matched your payment. Plans don&apos;t renew automatically;
          we remind you before they end.
        </li>
        <li>
          If a paid plan ends, the workspace keeps working for 7 days and then
          moves to the Free plan&apos;s limits. We don&apos;t delete your data
          because a plan ended.
        </li>
        <li>
          Payments are not refundable unless the law requires it or we agree
          otherwise. We may change prices for future periods; a period
          you&apos;ve already paid for keeps its price.
        </li>
      </ul>

      <h2>Availability and changes</h2>
      <ul>
        <li>
          We work to keep {siteConfig.name} available and your data backed up,
          but we can&apos;t promise it will never be interrupted. Keep your own
          copies of documents you&apos;re required to keep.
        </li>
        <li>
          We improve the service over time and may change or remove features. If
          we change these terms in a way that matters, we&apos;ll tell you
          before the change applies.
        </li>
      </ul>

      <h2>Ending</h2>
      <ul>
        <li>
          You can stop at any time. Owners can download all workspace data as
          CSV files and delete the workspace in Settings.
        </li>
        <li>
          Deleting a workspace removes its records and files permanently;
          backups expire on their normal schedule.
        </li>
      </ul>

      <h2>Liability</h2>
      <p>
        {siteConfig.name} is provided &quot;as is&quot;. To the extent the law
        allows, we aren&apos;t liable for indirect or consequential losses, and
        our total liability for any claim is limited to what you paid us in the
        12 months before it. Nothing here limits rights you have under consumer
        law that can&apos;t be excluded.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <Contact />.
      </p>
    </LegalPage>
  )
}

/** /privacy */
export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          This explains what {siteConfig.name} collects, why, and what you can
          do about it. In short: we use your data to run the service for you, we
          don&apos;t sell it, and you can take it with you or delete it.
        </>
      }
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your name, email address, password (stored
          hashed, never readable), and two-factor settings.
        </li>
        <li>
          <strong>Workspace content:</strong> what you and your team enter —
          your business profile, clients and their contacts, quotes, contracts,
          projects, time entries, invoices, payments, uploaded images and
          payment screenshots.
        </li>
        <li>
          <strong>Your clients:</strong> when they use the client portal, the
          email address they sign in with, and the name, time, IP address and
          browser they used to accept a quote, sign a contract or upload a
          payment proof (kept as a record of what happened).
        </li>
        <li>
          <strong>Usage and security:</strong> sign-in sessions, IP addresses
          and browser details, and an audit log of important actions in each
          workspace.
        </li>
        <li>
          <strong>Billing:</strong> the plan you pay for, the amounts, and the
          payment screenshots and references you upload.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>
          To run {siteConfig.name}: store your work, make PDFs, send the emails
          you ask us to send, and show your clients their documents.
        </li>
        <li>
          To keep it secure: verify sign-ins, stop abuse, and investigate
          problems.
        </li>
        <li>
          To contact you about your account, plan and important changes. We
          don&apos;t send marketing email without asking.
        </li>
      </ul>
      <p>
        For your workspace content, you decide what goes in and why; we process
        it on your behalf. For your account and billing data, we decide, to
        provide and secure the service.
      </p>

      <h2>Who else handles it</h2>
      <p>
        We don&apos;t sell personal data or use it for advertising. We use a
        small number of service providers to run {siteConfig.name}, only for
        that purpose:
      </p>
      <ul>
        <li>server hosting, databases and backups;</li>
        <li>file storage and network delivery;</li>
        <li>email delivery;</li>
        <li>error reporting, so we can fix bugs (when enabled).</li>
      </ul>
      <p>
        Staff can access a workspace only to support you or to keep the service
        safe, and every such access is recorded.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in and to remember
        settings such as the sidebar and theme. No advertising or tracking
        cookies.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Workspace content: until an owner deletes it or the workspace is
          deleted.
        </li>
        <li>
          Backups: overwritten on a rolling schedule (normally within a few
          weeks).
        </li>
        <li>
          Security and billing records: as long as needed for security, legal
          and accounting purposes.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          See and correct your details in the app. Workspace owners can download
          every record as CSV files and delete the workspace in Settings.
        </li>
        <li>
          To access, correct or delete personal data we hold about you, or to
          ask a question, contact <Contact />. If you&apos;re one of our
          users&apos; clients, contact the business that sent you the document
          first — they control that data.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Connections are encrypted, passwords are hashed, files are private and
        shared through short-lived links, and each workspace&apos;s data is kept
        separate from every other. No system is perfect; if a breach affects
        you, we&apos;ll tell you without undue delay.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that matters, we&apos;ll tell you
        before it applies. Questions: <Contact />.
      </p>
    </LegalPage>
  )
}
