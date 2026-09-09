import {sourceEvidenceOr} from '../sourceEvidence'

// Source presets, not local styles. Applying a mask preserves the values a preset describes, so the primary
// image's current presets are Masking's; user-defined styles are owned by the layer that created them and
// are never sourced from here.
export const getPreSetVisualizations = recipe =>
    sourceEvidenceOr(recipe, recipe.model?.imageToMask).visualizations
