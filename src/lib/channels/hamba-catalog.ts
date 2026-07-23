import type { SupabaseClient } from '@supabase/supabase-js';
import type { HambaFlowCatalog } from '@/lib/channels/hamba-flow';

type PropertyRow = {
  id: string;
  name: string;
  location: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  label: string;
  occupancy_status: string;
  is_blocked: boolean;
  is_available: boolean;
  ensuite: boolean;
  features: string[] | null;
  display_order: number;
};

function unitSummary(unit: UnitRow) {
  const facts = [unit.ensuite ? 'En-suite' : '', ...(unit.features ?? []).slice(0, 3)]
    .map((value) => value.trim())
    .filter(Boolean);
  return facts.length > 0
    ? `${facts.join(' · ')}. Availability must be confirmed by Hamba staff.`
    : 'Availability must be confirmed by Hamba staff.';
}

export function mapHambaCatalog(properties: PropertyRow[], units: UnitRow[]): HambaFlowCatalog {
  const orderedUnits = [...units].sort((left, right) => left.display_order - right.display_order || left.label.localeCompare(right.label));
  return {
    locations: properties.map((property) => ({
      id: property.id,
      name: property.name,
      area: property.location,
      units: orderedUnits
        .filter((unit) => unit.property_id === property.id)
        .map((unit) => ({
          id: unit.id,
          label: unit.label,
          summary: unitSummary(unit),
          isAvailable: unit.is_available && unit.occupancy_status === 'vacant' && !unit.is_blocked,
        })),
    })),
  };
}

export async function loadHambaCatalog(admin: SupabaseClient): Promise<HambaFlowCatalog> {
  const [propertiesResult, unitsResult] = await Promise.all([
    admin.from('properties').select('id,name,location').order('name'),
    admin
      .from('property_units')
      .select('id,property_id,label,occupancy_status,is_blocked,is_available,ensuite,features,display_order')
      .order('display_order'),
  ]);
  if (propertiesResult.error) throw new Error(`Property catalogue load failed: ${propertiesResult.error.message}`);
  if (unitsResult.error) throw new Error(`Unit catalogue load failed: ${unitsResult.error.message}`);
  return mapHambaCatalog(
    (propertiesResult.data ?? []) as PropertyRow[],
    (unitsResult.data ?? []) as UnitRow[]
  );
}
