import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Hamba Customer Service",
  description: "How Hamba Customer Service handles information in Hamba Trading's tenant, payment, and property tools.",
};

const updated = "20 July 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dceee7,_transparent_36%),linear-gradient(145deg,_#f8f5ec,_#eef4f1)] px-5 py-10 text-slate-900 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-white/95 shadow-[0_28px_80px_rgba(15,52,42,0.14)]">
        <header className="bg-emerald-950 px-6 py-10 text-white sm:px-12 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">Hamba Trading</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Privacy policy</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-emerald-50/80">
            This policy explains how we use personal information when people enquire about, apply for, or live in our rental properties.
          </p>
          <p className="mt-6 text-sm text-emerald-100/70">Last updated: {updated}</p>
        </header>

        <div className="space-y-9 px-6 py-10 text-[1.02rem] leading-8 text-slate-700 sm:px-12 sm:py-14">
          <PolicySection title="Who we are">
            <p>
              Hamba Trading (Property Management Company) (Pty) Ltd is the responsible party for the personal information described in this policy. We operate and manage residential studio and en-suite rental units in South Africa. Our tenant assistant supports property enquiries, applications, lease administration, service requests and ongoing tenant communication.
            </p>
          </PolicySection>

          <PolicySection title="Where information comes from">
            <p>
              We usually collect information directly from you through WhatsApp, our website, application forms, lease documents, payment communications and conversations with authorised staff. We may also receive information from a person you authorise, a payment provider or bank record used to reconcile a payment, a service provider acting for us, or a lawful public or verification source. If information comes from another source, we use it only where reasonably necessary and lawful.
            </p>
          </PolicySection>

          <PolicySection title="Google account data">
            <p>
              When an authorised Hamba account owner connects Google, Hamba Customer Service uses read-only Gmail and Google Drive access to locate Capitec payment notifications and supporting payment files, compare the two authorised mailboxes, detect missing or duplicate imports, and reconcile payments with tenant records. We do not send email, alter Gmail messages, or use Google account data for advertising. Google account data is available only to approved Hamba staff and service providers needed to operate this reconciliation workflow, is retained only for the operational and legal purposes described here, and may be disconnected by revoking the app&apos;s Google access. Our use and transfer of information received from Google APIs complies with the Google API Services User Data Policy, including its Limited Use requirements.
            </p>
          </PolicySection>

          <PolicySection title="Information we collect">
            <p>
              We may collect names, contact and identity details, property and unit preferences, application and affordability information, lease and payment-related records, emergency-contact information, messages, media or documents you choose to send, and service, maintenance, safety or complaint details. We also receive basic technical, account and message-delivery information needed to operate WhatsApp and our administration tools. Please provide only information that is relevant to your enquiry, application or tenancy, and never send a banking password, PIN or one-time password.
            </p>
          </PolicySection>

          <PolicySection title="Purposes and lawful grounds">
            <p>
              We process information to take steps you request before a lease, perform and administer a lease, answer enquiries, assess applications fairly, reconcile payments, support tenants, respond to maintenance or safety concerns, meet tax, accounting and other legal duties, protect people and property, prevent fraud or misuse, resolve disputes and improve our service. Depending on the activity, processing is based on requested pre-contract steps, performance of an agreement, a legal obligation, protection of legitimate interests that do not unfairly override your rights, or consent where the law requires it. You may withdraw consent for future processing at any time, although this does not invalidate lawful processing already completed.
            </p>
          </PolicySection>

          <PolicySection title="Required and optional information">
            <p>
              General property enquiries can usually be made with a name and contact method. Information marked as required during an application or lease process is needed to assess the application, verify the parties, prepare the lease, administer payments or meet legal obligations. If required information is not supplied, we may be unable to process the application, conclude or administer the lease, allocate a payment or resolve the request. Optional information may be withheld without losing access to unrelated services.
            </p>
          </PolicySection>

          <PolicySection title="Automated assistance and decisions">
            <p>
              Automated menus or language-model assistance may classify a request, retrieve approved property information, draft a response or route a conversation. Staff may review these interactions, and you may request a staff member at any time. We do not use the tenant assistant alone to make a final decision that approves or rejects an application, allocates a home, terminates a lease, evicts a tenant, resolves a payment dispute or otherwise has a legal or similarly significant effect. An authorised person must review and confirm those decisions, and an applicant may ask for an explanation or human reconsideration.
            </p>
          </PolicySection>

          <PolicySection title="WhatsApp and service providers">
            <p>
              Our WhatsApp communication uses Meta&apos;s WhatsApp Business services. We may also use contracted hosting, database, authentication, document, communications and artificial-intelligence providers only as needed to operate the service. They may receive the limited information needed for their function and must not use information on our behalf for an unrelated purpose. We may also disclose information where required by law, to professional advisers, or to protect a person, property or legal right. We do not sell tenant or prospective-tenant personal information.
            </p>
          </PolicySection>

          <PolicySection title="Processing outside South Africa">
            <p>
              Some technology providers may process or store information in countries outside South Africa. Before using such a provider, we take reasonable steps to require privacy and security protections appropriate to the information and to comply with South African rules for transborder information flows. You may contact us for more information about the categories of providers used for a particular service.
            </p>
          </PolicySection>

          <PolicySection title="Service messages and direct marketing">
            <p>
              Messages needed to answer an enquiry, progress an application, administer a lease, confirm a payment, address safety or maintenance, or respond to your request are service communications. We will not treat a property enquiry as general consent to unrelated promotional messaging. Where consent is required for direct marketing, we will request it separately. You may withdraw marketing consent or opt out at any time by replying <strong>STOP</strong> on WhatsApp or contacting us. Stopping marketing does not stop essential communications about an active application, lease, payment, safety matter or request.
            </p>
          </PolicySection>

          <PolicySection title="Retention and security">
            <p>
              We keep information only for as long as it is reasonably needed for the enquiry, application, tenancy, legal, accounting, safety, fraud-prevention or dispute-resolution purpose for which it was collected. Retention is determined by the status of the enquiry or tenancy, applicable legal periods and whether a record is needed for an active claim or investigation. Information that is no longer required is deleted, de-identified or securely restricted. We use access controls, staff permissions, backups and operational safeguards designed to limit information to authorised staff and service providers. No security measure is absolute; if a security compromise creates a legal notification duty, we will notify the Information Regulator and affected people as required.
            </p>
          </PolicySection>

          <PolicySection title="Your choices and rights">
            <p>
              Subject to applicable law, you may ask whether we hold your personal information, request access or correction, object to certain processing, withdraw consent, request deletion of information that we are no longer authorised to retain, and ask a staff member to take over or reconsider an automated interaction. We may need to verify identity and may refuse or limit a request where the law permits or requires us to keep a record. We will explain the outcome. See our <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="/data-deletion">privacy-request and data-deletion instructions</a>.
            </p>
          </PolicySection>

          <PolicySection title="Children">
            <p>
              Our property enquiry and application services are intended for adults. A child&apos;s personal information should be supplied only by, or with the involvement of, a competent person such as a parent or legal guardian and only where it is relevant to the proposed household or tenancy. Do not use the tenant assistant to send unnecessary information about a child.
            </p>
          </PolicySection>

          <PolicySection title="Complaints">
            <p>
              Please contact us first so that we can investigate and respond. You also have the right to lodge a complaint with South Africa&apos;s <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="https://inforegulator.org.za/" rel="noreferrer" target="_blank">Information Regulator</a>. Exercising a privacy right will not result in unfair treatment, although we may still need information that is genuinely required to provide a requested service or meet the law.
            </p>
          </PolicySection>

          <PolicySection title="Contact us">
            <p>
              Privacy and Information Officer enquiries may be sent to <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="mailto:info.hambatrading@gmail.com?subject=Privacy%20request">info.hambatrading@gmail.com</a> or Hamba Trading on WhatsApp at <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="https://wa.me/27812674647">+27 81 267 4647</a>. Please label the message “Privacy request” and do not send banking passwords, PINs or one-time passwords.
            </p>
          </PolicySection>

          <footer className="border-t border-slate-200 pt-8 text-sm text-slate-500">
            We may update this policy when our services or legal obligations change. The current version will remain available on this page. Read our <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="/terms">terms of service</a>.
          </footer>
        </div>
      </article>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">{title}</h2>
      {children}
    </section>
  );
}
