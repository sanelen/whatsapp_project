'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';

type MediaSlide = {
  src: string;
  alt: string;
  label: string;
  caption: string;
  objectPosition?: string;
};

type PropertyMediaCarouselProps = {
  slides: readonly MediaSlide[];
};

export function PropertyMediaCarousel({ slides }: PropertyMediaCarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function moveTo(index: number) {
    const rail = railRef.current;
    if (!rail) return;

    const nextIndex = (index + slides.length) % slides.length;
    const slide = rail.querySelectorAll<HTMLElement>('figure').item(nextIndex);
    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    setActiveIndex(nextIndex);
  }

  function updateActiveSlide() {
    const rail = railRef.current;
    if (!rail) return;

    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    const children = Array.from(rail.querySelectorAll<HTMLElement>('figure'));
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    children.forEach((slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(railCenter - slideCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveIndex(nearestIndex);
  }

  return (
    <div aria-label="Property media carousel" className="relative">
      <div className="flex items-end justify-between gap-4 px-6 pb-5 sm:px-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#89aeb8]">A closer look</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#f1e1c3] sm:text-3xl">
            Move through the spaces
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
            Swipe the gallery or use the arrows to explore example room details.
          </p>
        </div>

        <div className="hidden shrink-0 gap-2 sm:flex" aria-label="Gallery controls">
          <button
            type="button"
            onClick={() => moveTo(activeIndex - 1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#89aeb8]/40 text-[#c7dadd] transition hover:-translate-x-0.5 hover:bg-[#89aeb8]/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#89aeb8]"
            aria-label="Previous image"
          >
            <ArrowLeft aria-hidden size={18} />
          </button>
          <button
            type="button"
            onClick={() => moveTo(activeIndex + 1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#89aeb8] text-[#0b1112] transition hover:translate-x-0.5 hover:bg-[#bcd1d5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#89aeb8]"
            aria-label="Next image"
          >
            <ArrowRight aria-hidden size={18} />
          </button>
        </div>
      </div>

      <div
        ref={railRef}
        onScroll={updateActiveSlide}
        className="property-media-rail flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 sm:gap-5 sm:px-8"
      >
        {slides.map((slide, index) => (
          <figure
            key={slide.src}
            className={`group relative aspect-[4/3] min-w-[88%] snap-center overflow-hidden rounded-[24px] border bg-[#111819] shadow-[0_22px_70px_rgba(0,0,0,0.35)] transition duration-500 sm:min-w-[72%] lg:aspect-[16/9] lg:min-w-[68%] ${
              activeIndex === index
                ? 'scale-100 border-[#89aeb8]/55 opacity-100'
                : 'scale-[0.965] border-white/10 opacity-65'
            }`}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(min-width: 1024px) 68vw, (min-width: 640px) 72vw, 88vw"
              className="object-cover transition duration-700 group-hover:scale-[1.02]"
              style={{ objectPosition: slide.objectPosition ?? 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/5 to-transparent" />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-5 sm:p-6">
              <div>
                <p className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-[#b9d0d5]">{slide.label}</p>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-white/86 sm:text-base">{slide.caption}</p>
              </div>
              <span className="shrink-0 text-3xl font-black tracking-[-0.05em] text-white/25">
                {String(index + 1).padStart(2, '0')}
              </span>
            </figcaption>
          </figure>
        ))}
        <div aria-hidden className="min-w-1 shrink-0 sm:min-w-6" />
      </div>

      <div className="flex items-center justify-between gap-4 px-6 pt-1 sm:px-8">
        <div className="flex items-center gap-2" aria-label={`Image ${activeIndex + 1} of ${slides.length}`}>
          {slides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => moveTo(index)}
              className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#89aeb8] ${
                activeIndex === index ? 'w-9 bg-[#89aeb8]' : 'w-2 bg-white/24 hover:bg-white/45'
              }`}
              aria-label={`Show image ${index + 1}`}
              aria-current={activeIndex === index ? 'true' : undefined}
            />
          ))}
        </div>

        <div className="flex gap-2 sm:hidden" aria-label="Gallery controls">
          <button
            type="button"
            onClick={() => moveTo(activeIndex - 1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#89aeb8]/40 text-[#c7dadd]"
            aria-label="Previous image"
          >
            <ArrowLeft aria-hidden size={18} />
          </button>
          <button
            type="button"
            onClick={() => moveTo(activeIndex + 1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#89aeb8] text-[#0b1112]"
            aria-label="Next image"
          >
            <ArrowRight aria-hidden size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
