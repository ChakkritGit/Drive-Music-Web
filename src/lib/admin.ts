export function canViewAnalytics(email?: string | null): boolean {
  return email?.trim().toLowerCase() === "nongtonnee@gmail.com";
}
