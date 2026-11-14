import type { ContentBundle } from './types'

// Public shell only. Protected memories, photos, dates, and messages come from Auth-gated cloud reads.
export const DEFAULT_CONTENT: ContentBundle = {
  site: {
    herName: '纪念册',
    startDate: '',
    openingLine: '把日子放在这里',
    passHint: '',
  },
  photos: [],
  timeline: [],
  messages: [],
  staticLoadFailed: false,
}
