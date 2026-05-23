export function createObjectSpecifier(..._args: unknown[]): unknown { return {} }

export function createObjectSpecifierFromInterfaceSpecifier(specifier: unknown): unknown { return specifier }
export function createObjectSpecifierFromPrimaryKey(def: unknown, pk: unknown): string { return String(def) + ':' + String(pk) }
