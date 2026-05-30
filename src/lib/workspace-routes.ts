export function organizationPath(organizationId: string): string {
  return `/organizations/${organizationId}`;
}

export function propertyPath(propertyId: string): string {
  return `/properties/${propertyId}`;
}

export function propertyChatbotPath(propertyId: string): string {
  return `/properties/${propertyId}/chatbot`;
}
