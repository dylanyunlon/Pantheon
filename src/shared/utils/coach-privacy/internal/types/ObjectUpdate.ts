export type ObjectUpdate = { type: "added" | "modified" | "removed"; objectType: string; primaryKey: string | number; properties?: Record<string, unknown> }
