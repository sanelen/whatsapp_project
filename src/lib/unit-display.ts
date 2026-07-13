export function formatUnitOccupancySummary(input: {
  occupancy: 'occupied' | 'vacant';
  contacts: string[];
}) {
  const occupancy = input.occupancy === 'occupied' ? 'occupied' : 'vacant';
  const contact = input.contacts.length > 0 ? input.contacts.join(' · ') : 'no contact';
  return `${occupancy} · ${contact}`;
}
