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

// What a direct renderer may be offered: the name rule above, plus the physical one. An array-valued band has
// no single value per pixel to colour, so a style over one cannot be drawn whatever its name says - and that
// is true of a style the user saved exactly as it is of one inherited from the source, which is why this
// takes ALL candidates rather than presets alone.
//
// A filter, never a deletion. The style stays in the recipe and the band stays exportable; only the offer to
// draw it is withheld. Dimensionality has to be positively observed: a band whose type nothing reported is
// left a candidate rather than being relabelled scalar or array.
export const renderableVisualizations = (visualizations, availableBands = {}) => {
    const names = Object.keys(availableBands)
    const isArrayValued = band => availableBands[band]?.dataType?.arrayDimensions > 0
    return visualizationsWithAvailableBands(visualizations, names)
        .filter(({bands}) => !bands.some(isArrayValued))
}

// Keeping the identity a set of visualizations is already known by.
//
// A source read again yields the same styles as different objects, and where those objects are identified
// per read - an asset's presets are parsed out of its properties and given a fresh id every time - a saved
// selection naming one by id would be orphaned on every refresh. Matching is therefore by what a style IS,
// in three passes over the whole set so no candidate can claim an identity another candidate matches better:
//
//   1. an id already recorded is a genuine identity, kept as it is;
//   2. then an identical definition, which is an unchanged style whose id was regenerated;
//   3. then the band list, which is a restyled version of a style over those bands.
//
// Each recorded identity is claimed once. That is what stops a deleted style from handing its id to its
// surviving sibling over the same bands: the sibling matches itself exactly in pass 2, and the deleted one's
// id is simply left unclaimed. Two styles over one band changing together in the same read remain ambiguous,
// and pass 3 resolves them in order.
export const withKnownIdentities = (visualizations, known) => {
    const candidates = visualizations || []
    const remaining = (known || []).filter(({id, bands}) => id && bands)
    const claimed = new Array(candidates.length).fill(undefined)

    const claim = matches => candidates.forEach((visParams, index) => {
        if (claimed[index] !== undefined) {
            return
        }
        const found = remaining.findIndex(entry => matches(visParams, entry))
        if (found >= 0) {
            claimed[index] = remaining.splice(found, 1)[0].id
        }
    })

    claim((visParams, entry) => Boolean(visParams.id) && visParams.id === entry.id)
    claim((visParams, entry) => _.isEqual(_.omit(visParams, 'id'), _.omit(entry, 'id')))
    claim((visParams, entry) => _.isEqual(visParams.bands, entry.bands))

    return candidates.map((visParams, index) => {
        const id = claimed[index] || visParams.id
        return id ? {...visParams, id} : visParams
    })
}

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
