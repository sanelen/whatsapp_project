import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Hamba Trading",
  description: "Terms for using Hamba Trading's tenant and property communication tools.",
};

const updated = "16 July 2026";

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f3c978,_transparent_32%),radial-gradient(circle_at_bottom_right,_#b8d8ca,_transparent_34%),linear-gradient(145deg,_#faf4e7,_#edf3ee)] px-5 py-10 text-slate-900 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-white/95 shadow-[0_28px_80px_rgba(20,65,49,0.14)]">
        <header className="bg-emerald-950 px-6 py-10 text-white sm:px-12 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-300">Hamba Trading</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Terms of service</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-emerald-50/80">
            These terms apply when you use our website, tenant assistant, WhatsApp communication and related property-administration tools.
          </p>
          <p className="mt-6 text-sm text-emerald-100/70">Last updated: {updated}</p>
        </header>

        <div className="space-y-9 px-6 py-10 text-[1.02rem] leading-8 text-slate-700 sm:px-12 sm:py-14">
          <TermsSection title="Using our services">
            <p>
              You may use our services to enquire about Hamba Trading properties, receive approved property information, submit application details, manage tenancy administration and request support. You must provide information that is accurate to the best of your knowledge and use the service lawfully and respectfully. If we ask you to accept these terms during an application or another transaction, your acceptance applies to the version presented to you at that time.
            </p>
          </TermsSection>

          <TermsSection title="Property information and availability">
            <p>
              Property descriptions, prices, availability, viewing times and other operational details may change. Information shared through the tenant assistant is provided for enquiry and administration purposes and is subject to confirmation by authorised Hamba Trading staff. A message, viewing or application does not reserve a unit or create a tenancy.
            </p>
          </TermsSection>

          <TermsSection title="Leases, payments and applications">
            <p>
              A tenancy is governed by the written lease agreement accepted by the landlord and tenant. These platform terms do not replace or amend a lease. Applications remain subject to fair human review, and no automated message, application submission or payment creates a tenancy unless Hamba Trading confirms it. Payment instructions must be confirmed through an approved Hamba Trading channel. Never send a banking password, PIN or one-time password to us.
            </p>
          </TermsSection>

          <TermsSection title="Automated assistance and human review">
            <p>
              We will identify the tenant assistant as an automated service where it may not otherwise be clear. It may use menus or language-model assistance to answer common questions, retrieve approved property information and organise requests. Automated responses can be incomplete or mistaken. You may ask for a staff member at any time. Hamba Trading does not rely solely on an automated system to approve or reject an application, allocate a home, terminate a lease, evict a tenant, determine a payment dispute or make another decision that has a legal or similarly significant effect. Those decisions require authorised human review and confirmation.
            </p>
          </TermsSection>

          <TermsSection title="Fair treatment">
            <p>
              Property advertising, enquiries, viewings and applications are handled without unfair discrimination. Information may be requested where it is reasonably connected to the property, application, legal obligations, affordability assessment or safe management of the tenancy. Applicants may ask for a staff member to explain or review an application outcome.
            </p>
          </TermsSection>

          <TermsSection title="Acceptable use">
            <p>
              You must not impersonate another person, submit unlawful or harmful material, attempt to access another person&apos;s records, disrupt the service, misuse contact information or use our tools for fraud, harassment or unauthorised advertising. We may restrict access where reasonably necessary to protect people, property, records or the service.
            </p>
          </TermsSection>

          <TermsSection title="Third-party services">
            <p>
              Our tools may rely on services provided by Meta and WhatsApp, as well as hosting, authentication, database, document and artificial-intelligence providers. Their services may be interrupted or governed by additional terms. We remain responsible for selecting and managing providers used to process information on our behalf, but Hamba Trading is not responsible for a third-party service failure outside our reasonable control.
            </p>
          </TermsSection>

          <TermsSection title="Electronic communications">
            <p>
              You agree that routine service communications may be delivered using the WhatsApp number, email address or other contact details you provide. Please keep those details current. Electronic messages are not guaranteed to be uninterrupted or error-free, so urgent safety matters should also be reported directly to a staff member or the appropriate emergency service. Marketing messages are handled separately and may be stopped at any time as explained in our privacy policy.
            </p>
          </TermsSection>

          <TermsSection title="Privacy and records">
            <p>
              Our <Link className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="/privacy">privacy policy</Link> explains how we handle personal information. You can also read our <Link className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="/data-deletion">data-deletion instructions</Link>.
            </p>
          </TermsSection>

          <TermsSection title="Service changes and responsibility">
            <p>
              We may update, suspend or change parts of the service where reasonably required for security, maintenance, law or business operations. To the extent permitted by South African law, Hamba Trading is not liable for indirect loss caused by reliance on clearly unconfirmed automated information or by events outside our reasonable control. Nothing in these terms limits a right under the Consumer Protection Act, Rental Housing Act, Protection of Personal Information Act or another right or responsibility that cannot lawfully be limited or excluded.
            </p>
          </TermsSection>

          <TermsSection title="Business and contact details">
            <p>
              The service is operated in South Africa by <strong>Hamba Trading (Property Management Company) (Pty) Ltd</strong>, a residential property-management business. The website address is <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="https://hambatrading.co.za">hambatrading.co.za</a>. Service and complaint enquiries may be sent to <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="mailto:info.hambatrading@gmail.com">info.hambatrading@gmail.com</a> or WhatsApp <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="https://wa.me/27812674647">+27 81 267 4647</a>.
            </p>
          </TermsSection>

          <TermsSection title="Governing law and contact">
            <p>
              These platform terms are governed by the laws of South Africa. A concern should first be sent to Hamba Trading using the details above so that we can try to resolve it promptly. Nothing in these terms prevents a person from approaching a competent Rental Housing Tribunal, regulator, ombud, consumer body or court.
            </p>
          </TermsSection>

          <footer className="border-t border-slate-200 pt-8 text-sm text-slate-500">
            We may update these terms as our services or legal obligations change. The current version and effective date will remain available on this page. Where a change materially affects an active service or a person&apos;s rights, we will take reasonable steps to provide notice before the change applies.
          </footer>
        </div>
      </article>
    </main>
  );
}

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">{title}</h2>
      {children}
    </section>
  );
}
