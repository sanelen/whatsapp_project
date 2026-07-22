'use client';

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CarFront,
  MapPin,
  MessageCircle,
  Wifi,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';

import {
  propertyWhatsappUrl,
  publicProperties,
  type PublicProperty,
} from '@/lib/public-properties';

function PropertyVisual({ property }: { property: PublicProperty }) {
  if (property.image) {
    return (
      <Image
        src={property.image}
        alt={`Exterior of ${property.name} in ${property.area}`}
        fill
        priority
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 62vw, 86vw"
        className="object-cover transition duration-700 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${property.visualClass}`}>
      <div className="absolute -right-8 -top-16 h-52 w-52 rounded-full border border-white/25" />
      <div className="absolute -bottom-20 -left-12 h-64 w-64 rounded-full border border-white/20" />
      <div className="absolute inset-x-8 bottom-7 flex items-end justify-between text-white">
        <span className="text-[4.6rem] font-semibold leading-none tracking-[-0.08em] text-white/95">
          {property.monogram}
        </span>
        <span className="mb-2 max-w-28 text-right text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/75">
          Photo portfolio available
        </span>
      </div>
    </div>
  );
}

function PropertyCard({ property }: { property: PublicProperty }) {
  return (
    <article
      id={`property-${property.id}`}
      className="group min-w-[86%] snap-start overflow-hidden rounded-[26px] border border-white/85 bg-white/90 shadow-[0_22px_60px_rgba(15,23,42,0.12)] sm:min-w-[62%] lg:min-w-0"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-800">
        <PropertyVisual property={property} />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/70 to-transparent" />
        <div className="absolute inset-x-5 bottom-4 text-white">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-white/75">
            {property.area}
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{property.name}</h3>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-2 text-sm leading-6 text-slate-600">
          <MapPin aria-hidden className="mt-1 shrink-0 text-sky-800" size={16} />
          {property.mapsUrl ? (
            <a
              href={property.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-slate-300 underline-offset-4 transition hover:text-sky-800"
            >
              {property.address}
            </a>
          ) : (
            <span>{property.address}</span>
          )}
        </div>

        <div className="mt-5 space-y-3 border-y border-slate-200 py-4 text-sm leading-5 text-slate-700">
          <p className="font-semibold text-slate-950">{property.priceLine}</p>
          <p className="flex items-start gap-2">
            <Wifi aria-hidden className="mt-0.5 shrink-0 text-sky-700" size={15} />
            <span>{property.featureLine}</span>
          </p>
          <p className="flex items-start gap-2">
            <CarFront aria-hidden className="mt-0.5 shrink-0 text-amber-700" size={15} />
            <span>{property.parkingLine}</span>
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href={property.portfolioUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800 transition hover:border-sky-700 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            <Camera aria-hidden size={16} /> View photos
          </a>
          <a
            href={propertyWhatsappUrl(property)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            <MessageCircle aria-hidden size={16} /> Ask Hamba
          </a>
        </div>

        {property.id === 'essex' || property.id === 'quarry' || property.id === 'westridge' ? (
          <Link
            href={
              property.id === 'essex'
                ? '/marketing/33-essex'
                : property.id === 'quarry'
                  ? '/marketing/quarry-heights'
                  : '/marketing/westrich'
            }
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#e8ddc6] px-3 text-sm font-bold text-[#173f35] transition hover:bg-[#ddcba9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f35]"
          >
            View refreshed {property.name} advert <ArrowRight aria-hidden size={15} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function PropertyShowcase() {
  const railRef = useRef<HTMLDivElement>(null);

  function move(direction: -1 | 1) {
    const rail = railRef.current;
    const card = rail?.querySelector<HTMLElement>('article');
    if (!rail || !card) return;

    rail.scrollBy({ left: direction * (card.offsetWidth + 16), behavior: 'smooth' });
  }

  return (
    <section className="mt-14 sm:mt-16" aria-labelledby="property-showcase-heading">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">
            Three Durban locations
          </p>
          <h2 id="property-showcase-heading" className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Find the place that fits.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Browse each property, then ask us to confirm the room, price, household fit, and viewing time.
          </p>
        </div>

        <div className="flex gap-2 lg:hidden" aria-label="Property carousel controls">
          <button
            type="button"
            onClick={() => move(-1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 transition hover:border-sky-700 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            aria-label="Previous property"
          >
            <ArrowLeft aria-hidden size={18} />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            aria-label="Next property"
          >
            <ArrowRight aria-hidden size={18} />
          </button>
        </div>
      </div>

      <div
        ref={railRef}
        className="property-showcase-rail -mx-5 mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-7 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
      >
        {publicProperties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>

      <p className="mt-1 text-xs leading-5 text-slate-500">
        Photos show the properties, not guaranteed availability. Hamba staff confirm the final room and terms before payment.
      </p>
    </section>
  );
}
