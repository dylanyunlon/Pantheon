declare module 'type-fest' {
  export type GreaterThan<A extends number, B extends number> = boolean
  export type GreaterThanOrEqual<A extends number, B extends number> = boolean
  export type IsEqual<A, B> = A extends B ? B extends A ? true : false : false
  export type LessThan<A extends number, B extends number> = boolean
}
