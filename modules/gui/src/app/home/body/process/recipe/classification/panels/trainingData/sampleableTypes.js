// Only bulk/external sources are worth subsetting - manually COLLECTED points
// are usually few and deliberately placed, RECIPE reuses another recipe's
// training data as-is, and SAMPLE_CLASSIFICATION already has its own
// samplesPerClass control at generation time.
export const SAMPLEABLE_TYPES = ['CSV_UPLOAD', 'EE_TABLE', 'CEO']
