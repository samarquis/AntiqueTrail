// Display-only restriction for the first public milestone. Backend admission
// remains authoritative; this flag can never enable an account or private action.
export function isCatalogOnlyPublicTest(): boolean {
  return import.meta.env.VITE_PUBLIC_TEST_CATALOG_ONLY === 'true'
}

export function isPublicTestLifecyclePath(target: string): boolean {
  return [
    '/account',
    '/account/privacy',
    '/account/export',
    '/account/delete',
    '/account/delete/cancel',
  ].includes(target.split(/[?#]/, 1)[0])
}
