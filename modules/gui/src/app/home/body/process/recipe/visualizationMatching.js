import _ from 'lodash'

// Matching a selected visualization against the visualizations currently available.
//
// One helper, because the same question is asked at two different moments: at render, to decide whether a layer
// may be built from the current selection, and in the update effect, to decide what to do about that selection -
// fill in an absent one, refresh a matched one, or leave a stale one for the source change that may restore it.
// Two copies of this comparison would drift, and the render would then publish a preview the very next effect
// contradicts.
//
// The rule is the one already in use. An identified visualization matches by id alone, so a user can rename or
// restyle it without the selection jumping elsewhere. An unidentified one - a source preset - has only its bands
// to be known by, and must match them exactly.

// A band-name filter, and only that. It keeps visualizations whose every named band still exists, because one
// naming a band that is gone still matches by id forever - so the selection is never reconciled and every preview
// fails. It says nothing about whether those bands are physically renderable, belong to the product being shown,
// or satisfy a consuming operation; those are separate questions with separate owners.
export const visualizationsWithAvailableBands = (visualizations, availableBands) =>
    (visualizations || []).filter(({bands}) => bands.every(band => availableBands.includes(band)))

export const MATCHED = 'MATCHED'
export const STALE = 'STALE'
export const UNSELECTED = 'UNSELECTED'
export const NO_CANDIDATES = 'NO_CANDIDATES'

export const findVisualization = (visualizations, visParams) =>
    visParams
        ? (visualizations || []).find(({id, bands}) =>
            id === visParams.id && (visParams.id || _.isEqual(bands, visParams.bands))
        )
        : undefined

export const selectionState = ({visualizations, visParams}) => {
    if (!visualizations || !visualizations.length) {
        return NO_CANDIDATES
    }
    if (!visParams) {
        return UNSELECTED
    }
    return findVisualization(visualizations, visParams)
        ? MATCHED
        : STALE
}
