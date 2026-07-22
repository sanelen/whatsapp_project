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

import { PropertyMediaCarousel } from '@/components/public/property-media-carousel';
import { propertyWhatsappUrl, publicProperties } from '@/lib/public-properties';

const westrich = publicProperties.find((property) => property.id === 'westridge')!;

export const metadata: Metadata = {
  title: 'Westrich advert preview | Hamba Trading',
  description: 'A local preview of the refreshed Westrich property advert.',
  robots: { index: false, follow: false },
};

const confirmedHighlights = [
  'Studio and en-suite rental options',
  'One or two occupants, depending on the room',
  'Private en-suite examples shown in the portfolio',
];

const applicationChecklist = [
  'South African ID or passport',
  'Three months of bank statements',
  'Full name and contact details',
  'Move-in date and intended occupants',
];

const enquirySteps = [
  ['01', 'Browse the photos', 'See the building and example room layouts.'],
  ['02', 'Ask about a room', 'Staff confirms availability, price, household fit, and a viewing time.'],
  ['03', 'Submit documents', 'Apply after the right room has been identified.'],
] as const;

const westrichGallerySlides = [
  {
    src: '/marketing/westrich-kitchenette-entry.jpg',
    alt: 'Example Westrich unit entrance, security gate and in-unit sink',
    label: 'Unit entrance',
    caption: 'Example secured entrance and in-unit sink area. Layout and finishes may vary by unit.',
  },
  {
    src: '/marketing/westrich-empty-studio.jpg',
    alt: 'Empty studio floor area at Westrich',
    label: 'Open studio space',
    caption: 'An unfurnished example showing the open floor area. Room size and finishes may vary.',
  },
  {
    src: '/marketing/westrich-studio.jpg',
    alt: 'Example Westrich studio entrance and private en-suite',
    label: 'Studio and en-suite',
    caption: 'Example studio entrance and private en-suite. Room finishes may vary by unit.',
  },
  {
    src: '/marketing/westrich-full-ensuite.jpg',
    alt: 'Example private en-suite layout with basin and toilet at Westrich',
    label: 'En-suite layout',
    caption: 'A fuller view of an example private en-suite. Bathroom finishes may vary by unit.',
    objectPosition: 'center 58%',
  },
  {
    src: '/marketing/westrich-ensuite.jpg',
    alt: 'Example private shower and basin at Westrich',
    label: 'Private bathroom',
    caption: 'Example private shower and basin inside a Westrich unit.',
    objectPosition: 'center 62%',
  },
  {
    src: '/marketing/westrich-shower-detail.jpg',
    alt: 'Tiled private shower detail at Westrich',
    label: 'Shower detail',
    caption: 'A closer view of a tiled private shower. Bathroom finishes may vary by unit.',
    objectPosition: 'center 54%',
  },
] as const;

export default function WestrichAdvertPreviewPage() {
  return (
    <main className="min-h-screen bg-[#070a0b] px-3 py-5 text-[#f4f0e8] sm:px-8 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex w-full max-w-6xl items-center justify-between gap-4 print:hidden">
        <Link
          href="/#property-showcase-heading"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#c7dadd] transition hover:bg-white/8"
        >
          <ArrowLeft aria-hidden size={17} /> Back to properties
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          <a
            href="https://hambatrading.co.za"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-[0.12em] text-[#d4b473] transition hover:bg-white/8"
          >
            <Globe2 aria-hidden size={15} /> Website
          </a>
          <a
            href="/marketing/hamba-westrich-advert.pdf"
            download
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#89aeb8]/40 px-3 text-xs font-black uppercase tracking-[0.12em] text-[#c7dadd] transition hover:bg-[#89aeb8]/10"
          >
            <Download aria-hidden size={15} /> Full pamphlet PDF
          </a>
        </div>
      </div>

      <div className="mx-auto mb-5 flex w-full max-w-6xl items-start gap-3 rounded-2xl border border-[#89aeb8]/40 bg-[#89aeb8]/10 px-4 py-3 text-[#f4f0e8] print:hidden">
        <FileCheck2 aria-hidden className="mt-0.5 shrink-0 text-[#c7dadd]" size={20} />
        <div>
          <p className="text-sm font-black uppercase tracking-[0.08em] text-[#c7dadd]">Complete 3-page property pamphlet</p>
          <p className="mt-1 text-xs leading-5 text-white/65">
            The PDF contains the property details, household guidance, application steps, viewing process and payment safety information.
          </p>
        </div>
      </div>

      <article className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[30px] border border-[#769ca7]/50 bg-[#0e1213] shadow-[0_36px_120px_rgba(0,0,0,0.72)] print:max-w-none print:rounded-none print:shadow-none">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              'repeating-linear-gradient(132deg, transparent 0, transparent 18px, rgba(137,174,184,0.05) 19px, transparent 20px)',
          }}
        />

        <header className="relative z-10 flex items-center justify-between gap-4 border-b border-[#769ca7]/40 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/marketing/hamba-westrich-profile.svg"
              alt="Hamba Westrich profile icon"
              width={64}
              height={64}
              className="h-14 w-14 rounded-2xl border border-[#89aeb8]/45 sm:h-16 sm:w-16"
            />
            <div>
              <p className="text-lg font-black uppercase tracking-[0.1em] text-[#c7dadd] sm:text-2xl">Hamba Westrich</p>
              <p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-[0.28em] text-white/48 sm:text-xs">
                Studio & en-suite apartments
              </p>
            </div>
          </div>
          <a
            href="/marketing/hamba-westrich-profile.png"
            download
            className="hidden min-h-11 items-center gap-2 rounded-full border border-[#89aeb8]/35 px-4 text-xs font-black uppercase tracking-[0.12em] text-[#c7dadd] transition hover:bg-[#89aeb8]/10 sm:inline-flex"
          >
            <Download aria-hidden size={15} /> Profile image
          </a>
        </header>

        <section className="relative z-10 grid lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-14 lg:px-12 lg:py-16">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#89aeb8]">Newlands West, Durban</p>
            <h1 className="mt-4 text-5xl font-black uppercase leading-[0.86] tracking-[-0.055em] text-[#f1e1c3] sm:text-7xl lg:text-[5rem]">
              Rooms
              <br />
              to let
            </h1>
            <p className="mt-6 flex max-w-md items-start gap-3 text-sm leading-6 text-white/72 sm:text-base">
              <MapPin aria-hidden className="mt-1 shrink-0 text-[#89aeb8]" size={18} />
              {westrich.address}
            </p>

            <div className="mt-8 rounded-2xl border border-[#89aeb8]/35 bg-[#89aeb8]/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b9d0d5]">Recorded starting point</p>
              <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#f1e1c3]">Recorded from R1,900 / month</p>
              <p className="mt-1 text-sm font-semibold text-white/65">
                Recorded deposit baseline: R1,400. Confirm the selected room&apos;s current rent and deposit.
              </p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <a
                href={westrich.portfolioUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#a9c5ca] px-4 text-sm font-black text-[#0d1416] transition hover:bg-[#d2e1e3]"
              >
                <Camera aria-hidden size={17} /> View photos
              </a>
              <a
                href={propertyWhatsappUrl(westrich)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#89aeb8]/60 px-4 text-sm font-black text-[#c7dadd] transition hover:bg-[#89aeb8]/10"
              >
                <MessageCircle aria-hidden size={17} /> Ask Hamba
              </a>
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden border-t border-[#769ca7]/40 lg:min-h-[610px] lg:border-l lg:border-t-0">
            <Image
              src={westrich.image ?? ''}
              alt="Exterior courtyard and apartments at Westrich in Newlands West"
              fill
              priority
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
            <p className="absolute bottom-5 right-5 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white/82 backdrop-blur-sm">
              House No. 10, Newlands West
            </p>
          </div>
        </section>

        <section className="relative z-10 border-t border-[#769ca7]/40 py-8 sm:py-10">
          <PropertyMediaCarousel slides={westrichGallerySlides} />

          <div className="mx-6 mt-8 grid gap-3 border-t border-[#769ca7]/30 pt-7 sm:mx-8 sm:grid-cols-3">
            {confirmedHighlights.map((highlight) => (
              <p
                key={highlight}
                className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm font-semibold leading-5 text-white/78"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#89aeb8] text-[#0b1112]">
                  <Check aria-hidden size={13} strokeWidth={3} />
                </span>
                {highlight}
              </p>
            ))}
          </div>
        </section>

        <section className="relative z-10 grid border-t border-[#769ca7]/40 lg:grid-cols-3">
          <div className="border-b border-[#769ca7]/40 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#89aeb8]">Important fit notes</p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#f1e1c3]">Please check before viewing</h2>
            <p className="mt-4 rounded-2xl border border-[#89aeb8]/25 bg-[#89aeb8]/8 p-4 text-sm font-semibold leading-6 text-[#cfe0e2]">
              Parking is very limited and is never guaranteed. A bay is available only when management confirms it in writing.
            </p>
            <p className="mt-4 text-sm leading-6 text-white/66">
              Occupancy and household fit, including any children, must be confirmed by staff for the selected room before viewing.
            </p>
          </div>

          <div className="border-b border-[#769ca7]/40 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#89aeb8]">Application checklist</p>
            <div className="mt-5 space-y-3">
              {applicationChecklist.map((item) => (
                <p key={item} className="flex items-start gap-3 text-sm leading-5 text-white/75">
                  <FileCheck2 aria-hidden className="mt-0.5 shrink-0 text-[#89aeb8]" size={17} />
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-white/45">Additional documents may be requested during application review.</p>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#89aeb8]">Simple enquiry flow</p>
            <div className="mt-5 space-y-5">
              {enquirySteps.map(([number, title, description]) => (
                <div key={number} className="grid grid-cols-[2.25rem_1fr] gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#89aeb8]/60 text-xs font-black text-[#c7dadd]">
                    {number}
                  </span>
                  <div>
                    <p className="text-sm font-black text-[#f1e1c3]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/54">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="relative z-10 flex flex-col gap-5 border-t border-[#769ca7]/40 bg-[#89aeb8] px-6 py-6 text-[#0c1214] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Calls & WhatsApp</p>
            <p className="mt-1 text-2xl font-black tracking-[-0.025em]">081 267 4647</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <a href="https://hambatrading.co.za" target="_blank" rel="noreferrer" className="text-sm font-black underline decoration-black/35 underline-offset-4">
              hambatrading.co.za
            </a>
            <a
              href={propertyWhatsappUrl(westrich)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0d1315] px-5 text-sm font-black text-[#c7dadd] transition hover:bg-black"
            >
              Ask about Westrich <ArrowRight aria-hidden size={17} />
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
