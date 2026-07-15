export type PropertyId = 'quarry-heights' | 'westridge' | '33-essex';

export type ParkingOption = 'none' | 'pending' | 'allocated';
export type LeaseTermType = 'three-month-then-monthly' | 'month-to-month' | 'fixed-term';

export interface PropertyLeaseConfig {
  id: PropertyId;
  shortCode: string;
  referenceStyle: 'compact-unit-surname' | 'compact-unit-full-name' | 'essex-room';
  referenceVerified: boolean;
  name: string;
  area: string;
  address: string;
  rent: number | null;
  deposit: number | null;
  pricingNote: string;
  wifi: 'included' | 'unconfirmed';
  parkingDefault: ParkingOption;
  parkingLocked: boolean;
  parkingNote: string;
  utilities: string[];
  occupancyNote: string;
  rules: string[];
}

export interface LeaseDraft {
  propertyId: PropertyId;
  unit: string;
  tenantName: string;
  tenantSurname: string;
  tenantId: string;
  tenantPhone: string;
  tenantEmail: string;
  occupants: string;
  termType: LeaseTermType;
  commencementDate: string;
  endDate: string;
  rent: string;
  deposit: string;
  parking: ParkingOption;
  parkingBay: string;
  parkingFee: string;
  bankAccountId: string;
  emergencyName: string;
  emergencyPhone: string;
  signLocation: string;
  specialConditions: string;
}

export const propertyConfigs: Record<PropertyId, PropertyLeaseConfig> = {
  'quarry-heights': {
    id: 'quarry-heights',
    shortCode: 'QH',
    referenceStyle: 'compact-unit-surname',
    referenceVerified: true,
    name: 'Quarry Heights',
    area: 'Newlands East',
    address: '28 Nkunzana Grove, Newlands East, 4037',
    rent: 2200,
    deposit: 2200,
    pricingNote: 'Current documented baseline. Confirm availability for the selected unit.',
    wifi: 'included',
    parkingDefault: 'none',
    parkingLocked: true,
    parkingNote: 'No parking is available for tenants or guests.',
    utilities: ['Prepaid electricity', 'Water included subject to reasonable use', 'Free Wi-Fi'],
    occupancyNote:
      'Maximum two occupants. Residents under 12 are not permitted; ages 12-15 require management confirmation.',
    rules: [
      'No parking for tenants or guests.',
      'No parties, loud music, subletting or unlawful activity.',
      'Tenants are responsible for their visitors and must protect the peaceful use of the property.',
      'Report defects and damage promptly and complete the move-in condition record.',
    ],
  },
  westridge: {
    id: 'westridge',
    shortCode: 'WR',
    referenceStyle: 'compact-unit-full-name',
    referenceVerified: true,
    name: 'Westridge',
    area: 'Newlands West',
    address: 'House No. 10, 109585 St, Earlsfield, Newlands West, 4037',
    rent: null,
    deposit: null,
    pricingNote: 'Rent and deposit are unit-specific and must be entered from an approved offer.',
    wifi: 'unconfirmed',
    parkingDefault: 'pending',
    parkingLocked: false,
    parkingNote: 'Parking is very limited and must be confirmed for the specific unit.',
    utilities: ['Prepaid electricity', 'Water included where applicable'],
    occupancyNote: 'One or two occupants depending on the room. Confirm the approved limit for this unit.',
    rules: [
      'Parking is not included unless a specific bay is confirmed in this agreement.',
      'No subletting or unlawful activity.',
      'Tenants and visitors must respect the peaceful use of the property.',
      'Report defects and damage promptly and complete the move-in condition record.',
    ],
  },
  '33-essex': {
    id: '33-essex',
    shortCode: 'ESSEX',
    referenceStyle: 'essex-room',
    referenceVerified: true,
    name: '33 Essex',
    area: 'Bulwer / Berea',
    address: '33 Essex Road, Bulwer, Berea, Durban, 4083',
    rent: null,
    deposit: null,
    pricingNote: 'Rent and deposit vary by room and must be entered from an approved offer.',
    wifi: 'included',
    parkingDefault: 'pending',
    parkingLocked: false,
    parkingNote: 'Parking is very limited and allocated by the landlord on a first-come, first-served basis.',
    utilities: ['Prepaid electricity', 'Shared hot water', 'Individually metered cold water charged to the tenant', 'Free Wi-Fi'],
    occupancyNote: 'Occupancy depends on room size and must be confirmed for the selected room.',
    rules: [
      'Parking is very limited and is allocated by the landlord on a first-come, first-served basis. A bay is included only when recorded in this agreement.',
      'No parties, disruptive noise, subletting or unlawful activity.',
      'Child resident and visitor arrangements require management confirmation before signature.',
      'Report defects and damage promptly and complete the move-in condition record.',
    ],
  },
};

export function createLeaseDraft(propertyId: PropertyId): LeaseDraft {
  const property = propertyConfigs[propertyId];

  return {
    propertyId,
    unit: '',
    tenantName: '',
    tenantSurname: '',
    tenantId: '',
    tenantPhone: '',
    tenantEmail: '',
    occupants: '1',
    termType: 'three-month-then-monthly',
    commencementDate: '',
    endDate: '',
    rent: property.rent?.toString() ?? '',
    deposit: property.deposit?.toString() ?? '',
    parking: property.parkingDefault,
    parkingBay: '',
    parkingFee: '',
    bankAccountId: '',
    emergencyName: '',
    emergencyPhone: '',
    signLocation: 'Durban',
    specialConditions: '',
  };
}

export function buildPaymentReference(draft: LeaseDraft): string {
  const property = propertyConfigs[draft.propertyId];
  const cleanUnit = draft.unit.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const formattedUnit = /^\d+$/.test(cleanUnit) ? cleanUnit.padStart(2, '0') : cleanUnit;
  const firstNames = draft.tenantName.trim().replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ').toUpperCase();
  const surname = draft.tenantSurname.trim().replace(/[^a-zA-Z\s-]/g, '').replace(/\s+/g, ' ').toUpperCase();
  const fullName = [firstNames, surname].filter(Boolean).join(' ');

  if (property.referenceStyle === 'essex-room') {
    return formattedUnit ? `EssexRoom${formattedUnit}` : '';
  }

  const tenantPart = property.referenceStyle === 'compact-unit-full-name' ? fullName : surname;
  if (!formattedUnit || !tenantPart) return '';
  return `${property.shortCode}${formattedUnit} ${tenantPart}`;
}

export function leaseFilename(draft: LeaseDraft): string {
  const property = propertyConfigs[draft.propertyId];
  const unit = draft.unit.trim().replace(/[^a-zA-Z0-9-]/g, '-') || 'unit';
  const tenant = [draft.tenantName, draft.tenantSurname].join(' ').trim().replace(/[^a-zA-Z0-9-]/g, '-') || 'tenant-pending';
  return `${property.shortCode}-${unit}-${tenant}-full-lease-draft`;
}

export function validateLeaseDraft(draft: LeaseDraft): string[] {
  const property = propertyConfigs[draft.propertyId];
  const errors: string[] = [];

  if (!draft.unit.trim()) errors.push('Enter the room or unit number.');
  if (!draft.tenantName.trim()) errors.push('Enter the tenant first name before producing a signature-ready lease.');
  if (!draft.tenantSurname.trim()) errors.push('Enter the tenant surname before producing a signature-ready lease.');
  if (!draft.commencementDate) errors.push('Select the commencement date.');
  if (draft.termType === 'fixed-term' && !draft.endDate) errors.push('Select the fixed-term lease end date.');
  if (draft.termType === 'fixed-term' && draft.commencementDate && draft.endDate && draft.endDate <= draft.commencementDate) {
    errors.push('The lease end date must be after the commencement date.');
  }
  if (!draft.rent || Number(draft.rent) <= 0) errors.push('Enter the approved monthly rent.');
  if (!draft.deposit || Number(draft.deposit) < 0) errors.push('Enter the approved deposit.');
  if (!draft.occupants || Number(draft.occupants) < 1) errors.push('Enter at least one occupant.');
  if (property.parkingLocked && draft.parking !== 'none') {
    errors.push(`${property.name} cannot include tenant or guest parking.`);
  }
  if (!property.parkingLocked && draft.parking === 'pending') {
    errors.push('Confirm whether parking is excluded or a specific bay is allocated.');
  }
  if (draft.parking === 'allocated' && !draft.parkingBay.trim()) {
    errors.push('Enter the allocated parking bay.');
  }
  if (draft.parking === 'allocated' && draft.propertyId === '33-essex' && draft.parkingFee === '') {
    errors.push('Enter the approved parking fee, including 0 when there is no fee.');
  }
  if (!property.referenceVerified) {
    errors.push(`Verify the ${property.name} payment-reference format before producing a signature-ready lease.`);
  }

  return errors;
}

export function formatRand(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'To be confirmed';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount);
}
