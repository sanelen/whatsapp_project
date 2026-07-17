import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Requests and Data Deletion | Hamba Trading",
  description: "How to access, correct, object to processing of, or request deletion of information held by Hamba Trading.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#f6d9b8,_transparent_34%),linear-gradient(145deg,_#f8f5ec,_#eaf2ef)] px-5 py-10 text-slate-900 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-amber-950/10 bg-white/95 px-6 py-10 shadow-[0_28px_80px_rgba(74,44,21,0.13)] sm:px-12 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">Hamba Trading</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-emerald-950 sm:text-5xl">Privacy requests and data deletion</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">
          You can ask to access or correct personal information, object to certain processing, withdraw consent, or request deletion of information associated with a property enquiry, application, tenancy or tenant-assistant conversation.
        </p>

        <section className="mt-10 rounded-3xl bg-emerald-950 px-6 py-8 text-white sm:px-8">
          <h2 className="text-2xl font-semibold">How to make a request</h2>
          <ol className="mt-5 space-y-4 text-base leading-7 text-emerald-50/90">
            <li><strong className="text-white">1.</strong> Email <a className="font-semibold underline decoration-emerald-300 underline-offset-4" href="mailto:info.hambatrading@gmail.com?subject=Privacy%20request">info.hambatrading@gmail.com</a> with the subject “Privacy request”, or send that phrase to our WhatsApp number.</li>
            <li><strong className="text-white">2.</strong> State whether you want access, correction, an objection recorded, consent withdrawn or eligible information deleted. Include the WhatsApp number used to contact us and enough information to identify the relevant record.</li>
            <li><strong className="text-white">3.</strong> Do not send passwords, PINs or one-time passwords. We may ask for reasonable identity verification so that another person cannot access, change or delete your records without permission.</li>
          </ol>
        </section>

        <div className="mt-10 space-y-8 text-[1.02rem] leading-8 text-slate-700">
          <section>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">What happens next</h2>
            <p>We will record and review the request within a reasonable period, confirm the outcome using contact details connected to the record and explain any lawful limitation. Eligible information will be corrected, restricted or deleted from active systems, as appropriate. Where required and reasonably practical, we will also notify service providers acting for us.</p>
          </section>
          <section>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">Records we may retain</h2>
            <p>Some records may be retained where required for legal, tax, accounting, lease, payment, safety, fraud-prevention or dispute-resolution purposes. Information may also remain temporarily in protected backups until the normal backup cycle replaces it. When full deletion is not permitted, we will restrict use to the reason the record must be retained and explain that reason where the law allows.</p>
          </section>
          <section>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">Marketing opt-out</h2>
            <p>You can stop promotional WhatsApp messages by replying <strong>STOP</strong>. This does not prevent necessary replies to your request or essential communications about an active application, lease, payment, maintenance or safety matter.</p>
          </section>
          <section>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">If you are dissatisfied</h2>
            <p>Ask us to review the outcome by replying to the decision. You may also lodge a complaint with South Africa&apos;s <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="https://inforegulator.org.za/" rel="noreferrer" target="_blank">Information Regulator</a>.</p>
          </section>
          <section>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-emerald-950">Questions</h2>
            <p>For more information, read our <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="/privacy">privacy policy</a> and <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="/terms">terms of service</a>, or contact us on WhatsApp at <a className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4" href="https://wa.me/27812674647">+27 81 267 4647</a>.</p>
          </section>
        </div>

        <Link className="mt-10 inline-flex rounded-full bg-amber-300 px-5 py-3 font-semibold text-amber-950 transition hover:bg-amber-200" href="/">
          Return to Hamba Trading
        </Link>
      </article>
    </main>
  );
}
