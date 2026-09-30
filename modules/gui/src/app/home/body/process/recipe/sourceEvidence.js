import _ from 'lodash'

import {INHERITED, inheritedSchemaSource} from '#sepal/recipe/output/inheritedSchemaSource'
import {referenceKey} from '#sepal/recipe/output/observeImageOutput'
import {directSourceEdges} from '#sepal/recipe/source/directSources'

import {withKnownIdentities} from './visualizationMatching'

// Current evidence about the source a recipe inherits its schema from, held in runtime state.
//
// A recipe that declares it preserves an input's band mapping and values has that input's CURRENT presets, not the
// ones copied into its model when the input was selected; its bands are its declaration's to describe. This reads
// what the sync component observed, and is the only reader: the types that inherit answer from it through their own
// helpers.
//
// Runtime only. `recipe.ui` is stripped before persisting, so nothing here is written into a saved recipe,
// no saved recipe is rewritten, and a session that never observes simply has no evidence.
//
// Evidence names the source it came from and is answered only for that source. A user who changes the
// selection has, at that instant, no evidence for the new one - which is the point: describing the new
// source with the old source's bands is the silent substitution this exists to prevent.

export const OBSERVED = 'OBSERVED'
export const UNAVAILABLE = 'UNAVAILABLE'
export const UNOBSERVED = 'UNOBSERVED'

export const inheritedSourceReference = recipe => {
    const {status, reference} = inheritedSchemaSource(recipe)
    return status === INHERITED ? reference : null
}

export const sourceKeyOf = reference =>
    reference ? referenceKey(reference) : null

export const inheritedSourceKey = recipe =>
    sourceKeyOf(inheritedSourceReference(recipe))

// Model fields behind the consumer's declared selections. Reapplying a source panel requests a fresh
// observation even when its source IDs are unchanged.
export const declaredSelections = recipe =>
    directSourceEdges(recipe).edges.map(({path}) => _.get(recipe, path))

export const currentSourceEvidence = recipe => {
    const evidence = recipe?.ui?.sourceEvidence
    const key = inheritedSourceKey(recipe)
    return key && evidence?.sourceKey === key
        ? evidence
        : null
}

// The presets a consumer offers from what its source offers. An observation that FAILED offers none: presenting the
// styles a saved recipe remembers would present as current what nothing has verified. Not having observed yet is
// different, and the copied snapshot remains the answer for it, which keeps a Masking layer opened inside another
// recipe's map - where nothing is observing - offering what it always has.
export const sourceEvidenceOr = (recipe, snapshot) => {
    const evidence = currentSourceEvidence(recipe)
    if (evidence?.status === UNAVAILABLE) {
        return {visualizations: []}
    }
    if (evidence?.status === OBSERVED) {
        return {visualizations: withKnownIdentities(evidence.visualizations, snapshot?.visualizations)}
    }
    return {visualizations: snapshot?.visualizations || []}
}
