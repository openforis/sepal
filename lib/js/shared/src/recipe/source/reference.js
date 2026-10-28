// Canonical source references.
//
// A source a user selected is either another SEPAL recipe or an Earth Engine asset, and everything
// downstream - dependency closure, cycle detection, asset observation, fingerprinting - keys off these two
// shapes. Nothing here knows how any recipe model stores them: models keep bare id strings and their own
// section vocabularies, and normalizing those is the job of the recipe type that owns the model, or of a
// model helper shared by several of them.
//
// Pure: no React, Redux, Earth Engine or task infrastructure.

export const RECIPE_REF = 'RECIPE_REF'
export const ASSET = 'ASSET'

export const recipeReference = id => ({type: RECIPE_REF, id})

export const assetReference = id => ({type: ASSET, id})

export const isReferenceId = value =>
    typeof value === 'string' && value.trim().length > 0

// Recognized by shape alone, whether or not it carries a usable id: a half-written reference is still a
// reference, and a guard that only recognized complete ones would miss exactly the broken cases.
export const isCanonicalReferenceShaped = value =>
    !!value && typeof value === 'object' && !Array.isArray(value)
        && (value.type === RECIPE_REF || value.type === ASSET)
