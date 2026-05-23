export function extractNamespace(apiName: string): string { const parts = apiName.split('.'); return parts.length > 1 ? parts.slice(0, -1).join('.') : '' }
