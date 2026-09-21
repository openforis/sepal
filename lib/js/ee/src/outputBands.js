// Factory arguments for an operation whose band selection names the bands it wants back, in that order. A
// producer whose selection means something else, or that would return more, reads `outputBands`; the others build
// from the selection as they always have. Internal callers that pass producer-specific selections do not use this.
export const withOutputBands = bands =>
    bands?.selection?.length ? {...bands, outputBands: bands.selection} : bands
