import {mayProvide} from './providerStep.js'

// The CCDC_SEGMENTS capability: which recipe actually produces the segments a source stands for.

export const CCDC_SEGMENTS = {
    name: 'CCDC_SEGMENTS',
    // What a producer of CCDC segments declares about them: how its dates are represented, whether its base
    // band names can be selected on it, and where its segments live when they live in an asset.
    declaration: 'segmentSource'
}

// What consumers report when a source cannot supply segments. Both are externally observable - the GUI's
// error code and the Earth Engine exception's - so they are named once here.
export const UNSUPPORTED_SEGMENT_SOURCE = 'UNSUPPORTED_SEGMENT_SOURCE'
export const MALFORMED_SEGMENT_SOURCE = 'MALFORMED_SEGMENT_SOURCE'

export const mayProvideSegments = type =>
    mayProvide(type, CCDC_SEGMENTS)
