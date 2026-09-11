export const SITE_ORIGIN: string;
export const canonicalAliases: Readonly<Record<string, string>>;
export function canonicalPath(route: string): string;
export function canonicalUrl(route: string): string;
export function isUtilityRoute(route: string): boolean;
export function isIndexableRoute(route: string, status?: string): boolean;
export function isProductionHostname(hostname: string): boolean;
export function serializeJsonLd(value: unknown): string;
