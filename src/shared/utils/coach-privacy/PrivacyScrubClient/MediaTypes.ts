export interface MediaPropertyLocation {
  apiName: string
  objectType: string
  primaryKey: string | number
  propertyName: string
  piiFieldType: string
  piiKey: string | number
  getMediaReference?: () => unknown
  mediaSetRid?: string
  path?: string
}
