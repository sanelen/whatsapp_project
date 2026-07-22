export type PublicProperty = {
  id: 'essex' | 'westridge' | 'quarry';
  name: string;
  area: string;
  address: string;
  shortAddress: string;
  image?: string;
  monogram: string;
  visualClass: string;
  priceLine: string;
  featureLine: string;
  parkingLine: string;
  portfolioUrl: string;
  mapsUrl?: string;
};

export const publicProperties: PublicProperty[] = [
  {
    id: 'essex',
    name: '33 Essex',
    area: 'Bulwer / Berea',
    address: '33 Essex Road, Bulwer, Berea, Durban, 4083',
    shortAddress: '33 Essex Road, Bulwer',
    image: '/marketing/33-essex-exterior.jpg',
    monogram: '33',
    visualClass: 'from-[#143f36] via-[#1f6557] to-[#c8a969]',
    priceLine: 'Ask us to confirm the current room price',
    featureLine: 'Studio and en-suite rentals with free Wi-Fi',
    parkingLine: 'Parking is very limited and must be allocated in writing',
    portfolioUrl: 'https://photos.app.goo.gl/kMR2VEfBo4EXLZJQA',
  },
  {
    id: 'westridge',
    name: 'Westrich',
    area: 'Newlands West',
    address: 'House No. 10, 109585 St, Earlsfield, Newlands West, 4037',
    shortAddress: 'House No. 10, Earlsfield',
    image: '/marketing/westrich-exterior.jpg',
    monogram: 'WR',
    visualClass: 'from-[#15364a] via-[#2b6680] to-[#b7d5d6]',
    priceLine: 'Recorded from R1,900; confirm the current room price',
    featureLine: 'Studio and en-suite rentals for one or two, depending on the room',
    parkingLine: 'Parking is very limited and is never guaranteed',
    portfolioUrl: 'https://photos.app.goo.gl/xwUqocDcoAvnMpmW8',
    mapsUrl: 'https://maps.app.goo.gl/9YEjHEE2p724LUYh8?g_st=aw',
  },
  {
    id: 'quarry',
    name: 'Quarry Heights',
    area: 'Newlands East',
    address: '28 Nkunzana Grove, Newlands East, 4037',
    shortAddress: '28 Nkunzana Grove',
    image: '/marketing/quarry-heights-exterior.jpg',
    monogram: 'QH',
    visualClass: 'from-[#5f3c27] via-[#9a6842] to-[#e1c697]',
    priceLine: 'Current documented baseline: R2,200 per month',
    featureLine: 'Studio and en-suite rentals with free Wi-Fi; maximum two occupants',
    parkingLine: 'No tenant or guest parking is available',
    portfolioUrl: 'https://photos.app.goo.gl/56RH6eEDm8tBMWxo8',
    mapsUrl: 'https://maps.app.goo.gl/i89MQThp1StcQssK7',
  },
];

export function propertyWhatsappUrl(property: PublicProperty) {
  const message = `Hello Hamba Trading, I'm interested in ${property.name} in ${property.area}. Please share the current availability and price.`;
  return `https://wa.me/27812674647?text=${encodeURIComponent(message)}`;
}
