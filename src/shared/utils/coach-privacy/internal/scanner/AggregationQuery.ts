export type AggregationPayloadBase = { data: unknown; status: string }
export class AggregationQuery { protected store: any; protected piiFieldKey: any; protected logger: any; protected parsedWirePipelineSet: any; protected rdpConfig: any; protected scrubNormalizedWhere: any; protected scrubNormalizedAggregate: any; revalidate(_force: boolean): Promise<void> { return Promise.resolve() } }
