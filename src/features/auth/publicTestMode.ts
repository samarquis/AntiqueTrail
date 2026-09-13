// Display-only restriction for the first public milestone. Backend admission
// remains authoritative; this flag can never enable an account or private action.
export function isCatalogOnlyPublicTest(): boolean {
  return import.meta.env.VITE_PUBLIC_TEST_CATALOG_ONLY === 'true'
}
