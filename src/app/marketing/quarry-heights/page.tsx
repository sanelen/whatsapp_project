import type { Metadata } from 'next';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  FileCheck2,
  Globe2,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { propertyWhatsappUrl, publicProperties } from '@/lib/public-properties';

const quarry = publicProperties.find((property) => property.id === 'quarry')!;

export const metadata: Metadata = {
  title: 'Quarry Heights advert preview | Hamba Trading',
  description: 'A local preview of the refreshed Quarry Heights property advert.',
  robots: { index: false, follow: false },
};

const confirmedHighlights = [
  'Studio and en-suite rental options',
  'Free Wi-Fi included',
  'Maximum two occupants per unit',
];

const applicationChecklist = [
  'South African ID or passport',
  'Three months of bank statements',
  'Full name and contact details',
  'Move-in date and intended occupants',
];

const enquirySteps = [
  ['01', 'Browse the photos', 'See the building and example room layouts.'],
  ['02', 'Ask about a room', 'Staff confirms availability, household fit, and a viewing time.'],
  ['03', 'Submit documents', 'Apply after the right room has been identified.'],
] as const;

export default function QuarryHeightsAdvertPreviewPage() {
  return (
    <main className="min-h-screen bg-[#090806] px-3 py-5 text-[#f7efe3] sm:px-8 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex w-full max-w-6xl items-center justify-between gap-4 print:hidden">
        <Link
          href="/#property-showcase-heading"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#f1d6aa] transition hover:bg-white/8"
        >
          <ArrowLeft aria-hidden size={17} /> Back to properties
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          <a
            href="https://hambatrading.co.za"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-[0.12em] text-[#e6b976] transition hover:bg-white/8"
          >
            <Globe2 aria-hidden size={15} /> Website
          </a>
          <a
            href="/marketing/hamba-quarry-heights-advert.pdf"
            download
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#c88743]/40 px-3 text-xs font-black uppercase tracking-[0.12em] text-[#e6b976] transition hover:bg-[#c88743]/10"
          >
            <Download aria-hidden size={15} /> Full pamphlet PDF
          </a>
        </div>
      </div>

      <div className="mx-auto mb-5 flex w-full max-w-6xl items-start gap-3 rounded-2xl border border-[#c88743]/40 bg-[#c88743]/10 px-4 py-3 text-[#f7efe3] print:hidden">
        <FileCheck2 aria-hidden className="mt-0.5 shrink-0 text-[#e6b976]" size={20} />
        <div>
          <p className="text-sm font-black uppercase tracking-[0.08em] text-[#e6b976]">Complete 3-page property pamphlet</p>
          <p className="mt-1 text-xs leading-5 text-white/65">
            The PDF contains the property details, household guidance, application steps, viewing process and payment safety information.
          </p>
        </div>
      </div>

      <article className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[30px] border border-[#b9783c]/50 bg-[#12100d] shadow-[0_36px_120px_rgba(0,0,0,0.72)] print:max-w-none print:rounded-none print:shadow-none">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              'repeating-linear-gradient(132deg, transparent 0, transparent 18px, rgba(212,154,82,0.05) 19px, transparent 20px)',
          }}
        />

        <header className="relative z-10 flex items-center justify-between gap-4 border-b border-[#b9783c]/40 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/marketing/hamba-quarry-heights-profile.svg"
              alt="Hamba Quarry Heights profile icon"
              width={64}
              height={64}
              className="h-14 w-14 rounded-2xl border border-[#d5a35f]/45 sm:h-16 sm:w-16"
            />
            <div>
              <p className="text-lg font-black uppercase tracking-[0.1em] text-[#e6b976] sm:text-2xl">Hamba Quarry Heights</p>
              <p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-[0.28em] text-white/48 sm:text-xs">
                Studio & en-suite apartments
              </p>
            </div>
          </div>
          <a
            href="/marketing/hamba-quarry-heights-profile.png"
            download
            className="hidden min-h-11 items-center gap-2 rounded-full border border-[#d5a35f]/35 px-4 text-xs font-black uppercase tracking-[0.12em] text-[#e6b976] transition hover:bg-[#d5a35f]/10 sm:inline-flex"
          >
            <Download aria-hidden size={15} /> Profile image
          </a>
        </header>

        <section className="relative z-10 grid lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-14 lg:px-12 lg:py-16">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#cf8f4b]">Newlands East, Durban</p>
            <h1 className="mt-4 text-5xl font-black uppercase leading-[0.86] tracking-[-0.055em] text-[#f4dfbe] sm:text-7xl lg:text-[5rem]">
              Rooms
              <br />
              to let
            </h1>
            <p className="mt-6 flex max-w-md items-start gap-3 text-sm leading-6 text-white/72 sm:text-base">
              <MapPin aria-hidden className="mt-1 shrink-0 text-[#cf8f4b]" size={18} />
              {quarry.address}
            </p>

            <div className="mt-8 rounded-2xl border border-[#c88743]/35 bg-[#c88743]/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#dca65f]">Current documented baseline</p>
              <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#f5e0bc]">R2,200 / month</p>
              <p className="mt-1 text-sm font-semibold text-white/65">Refundable deposit: R2,200. Confirm current availability.</p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <a
                href={quarry.portfolioUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d69b53] px-4 text-sm font-black text-[#17110b] transition hover:bg-[#efd2a3]"
              >
                <Camera aria-hidden size={17} /> View photos
              </a>
              <a
                href={propertyWhatsappUrl(quarry)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d69b53]/60 px-4 text-sm font-black text-[#efc98e] transition hover:bg-[#d69b53]/10"
              >
                <MessageCircle aria-hidden size={17} /> Ask Hamba
              </a>
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden border-t border-[#b9783c]/40 lg:min-h-[610px] lg:border-l lg:border-t-0">
            <Image
              src={quarry.image ?? ''}
              alt="Exterior of Quarry Heights in Newlands East"
              fill
              priority
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
            <p className="absolute bottom-5 right-5 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white/82 backdrop-blur-sm">
              28 Nkunzana Grove
            </p>
          </div>
        </section>

        <section className="relative z-10 grid border-t border-[#b9783c]/40 md:grid-cols-[1.05fr_0.95fr]">
          <figure className="relative min-h-[390px] overflow-hidden md:min-h-[540px]">
            <Image
              src="/marketing/quarry-heights-studio.jpg"
              alt="Example studio and en-suite layout at Quarry Heights"
              fill
              sizes="(min-width: 768px) 53vw, 100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <figcaption className="absolute inset-x-5 bottom-5 text-xs font-semibold leading-5 text-white/78">
              Example studio and en-suite layout. Room finishes may vary by unit.
            </figcaption>
          </figure>

          <div className="grid border-t border-[#b9783c]/40 md:border-l md:border-t-0">
            <figure className="relative min-h-[300px] overflow-hidden border-b border-[#b9783c]/40">
              <Image
                src="/marketing/quarry-heights-bathroom.jpg"
                alt="Example private shower and basin at Quarry Heights"
                fill
                sizes="(min-width: 768px) 47vw, 100vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <figcaption className="absolute inset-x-5 bottom-5 text-xs font-semibold text-white/78">Private shower and basin example</figcaption>
            </figure>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#cf8f4b]">Confirmed essentials</p>
              <div className="mt-5 space-y-4">
                {confirmedHighlights.map((highlight) => (
                  <p key={highlight} className="flex items-start gap-3 text-sm font-semibold leading-5 text-white/82">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#cf8f4b] text-[#15100a]">
                      <Check aria-hidden size={13} strokeWidth={3} />
                    </span>
                    {highlight}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 grid border-t border-[#b9783c]/40 lg:grid-cols-3">
          <div className="border-b border-[#b9783c]/40 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#cf8f4b]">Important fit notes</p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#f4dfbe]">Please check before viewing</h2>
            <p className="mt-4 rounded-2xl border border-[#c88743]/25 bg-[#c88743]/8 p-4 text-sm font-semibold leading-6 text-[#efd4aa]">
              No tenant or guest parking is available at Quarry Heights.
            </p>
            <p className="mt-4 text-sm leading-6 text-white/66">
              Current lease rules do not allow children under 12. For children aged 12-15, ask staff to confirm household suitability before viewing.
            </p>
          </div>

          <div className="border-b border-[#b9783c]/40 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#cf8f4b]">Application checklist</p>
            <div className="mt-5 space-y-3">
              {applicationChecklist.map((item) => (
                <p key={item} className="flex items-start gap-3 text-sm leading-5 text-white/75">
                  <FileCheck2 aria-hidden className="mt-0.5 shrink-0 text-[#cf8f4b]" size={17} />
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-white/45">Additional documents may be requested during application review.</p>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#cf8f4b]">Simple enquiry flow</p>
            <div className="mt-5 space-y-5">
              {enquirySteps.map(([number, title, description]) => (
                <div key={number} className="grid grid-cols-[2.25rem_1fr] gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cf8f4b]/60 text-xs font-black text-[#e6b976]">
                    {number}
                  </span>
                  <div>
                    <p className="text-sm font-black text-[#f4dfbe]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/54">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="relative z-10 flex flex-col gap-5 border-t border-[#b9783c]/40 bg-[#c88743] px-6 py-6 text-[#17110b] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Calls & WhatsApp</p>
            <p className="mt-1 text-2xl font-black tracking-[-0.025em]">081 267 4647</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <a href="https://hambatrading.co.za" target="_blank" rel="noreferrer" className="text-sm font-black underline decoration-black/35 underline-offset-4">
              hambatrading.co.za
            </a>
            <a
              href={propertyWhatsappUrl(quarry)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#15110c] px-5 text-sm font-black text-[#efc98e] transition hover:bg-black"
            >
              Ask about Quarry Heights <ArrowRight aria-hidden size={17} />
            </a>
          </div>
        </footer>

        <p className="relative z-10 border-t border-white/5 px-6 py-4 text-center text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white/38">
          Photos show example layouts and do not guarantee availability. Full rental terms are provided in the lease.
        </p>
      </article>
    </main>
  );
}
