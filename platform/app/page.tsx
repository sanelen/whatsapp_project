export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <main className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">WhatsApp Platform</h1>
          <p className="mt-2 text-slate-600">Quick access to the pages and endpoints you are validating.</p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">App Pages</h2>
          <ul className="mt-4 space-y-3 text-slate-700">
            <li>
              <a className="text-blue-700 underline" href="/admin">
                /admin - Conversation list and recent messages
              </a>
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">API Endpoints</h2>
          <ul className="mt-4 space-y-3 text-slate-700">
            <li>
              <a className="text-blue-700 underline" href="/api/health" target="_blank" rel="noreferrer">
                /api/health - Service health status
              </a>
            </li>
            <li>
              <span className="font-medium">/api/webhooks/twilio</span> - Twilio inbound webhook (GET and POST)
            </li>
            <li>
              <span className="font-medium">/api/whatsapp/send</span> - Outbound send API (POST)
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
