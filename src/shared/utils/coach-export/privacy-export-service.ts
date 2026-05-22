import type { TrainingSample, CaptureEvent } from '../coach-capture/experiment-capture'
import type { PrivacyScrubber } from '../coach-capture/privacy-scrubber'
import type { ExportPayload, ExportOptions } from './data-export-service'
import { exportToJson, exportSamplesToCsv } from './data-export-service'

export function scrubBeforeExport(
  payload: ExportPayload,
  scrubber: PrivacyScrubber
): ExportPayload {
  return {
    meta: {
      ...payload.meta,
      sessionId: payload.meta.sessionId
    },
    samples: payload.samples.map(s => scrubber.scrubTrainingSample(s)),
    events: payload.events.map(e => scrubber.scrubCaptureEvent(e))
  }
}

export function exportToJsonWithPrivacy(
  payload: ExportPayload,
  scrubber: PrivacyScrubber,
  options?: Partial<ExportOptions>
): string {
  const scrubbed = scrubBeforeExport(payload, scrubber)
  return exportToJson(scrubbed, options)
}

export function exportSamplesToCsvWithPrivacy(
  samples: TrainingSample[],
  scrubber: PrivacyScrubber,
  filterOutcome?: string
): string {
  const scrubbed = samples.map(s => scrubber.scrubTrainingSample(s))
  return exportSamplesToCsv(scrubbed, filterOutcome)
}
