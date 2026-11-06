import _ from 'lodash'

import {committedBandNames, savedBandNames} from '#sepal/recipe/type/stack'

import {renamedVisualizationBands} from '../visualizationRenames'

// What Stack keeps derived in the applied recipe (derivedResult.js): the names of its output bands, given by every
// commit, whichever editor commits it, by the rule the declaration owns (committedBandNames), and its own
// visualizations, following each band's name. Nothing is acquired: configuration alone is read.

export const STACK_BAND_NAMES_DERIVATION = 'stack.bandNames'

export const stackDerivations = [
    {id: STACK_BAND_NAMES_DERIVATION, applied: {followRecipe: followedBandNames}}
]

function followedBandNames(previous, recipe) {
    const {bandNames, retired} = committedBandNames(previous.model, recipe.model)
    const visualizations = recipe.layers?.userDefinedVisualizations?.['this-recipe'] || []
    const renamed = renamedVisualizationBands(visualizations, renamesBetween(previous.model, bandNames))
    return [
        ...(_.isEqual(bandNames, recipe.model.bandNames?.bandNames) ? [] : [{path: 'model.bandNames.bandNames', value: bandNames}]),
        ...(_.isEqual(retired, recipe.model.bandNames?.retired || []) ? [] : [{path: 'model.bandNames.retired', value: retired}]),
        ...(_.isEqual(renamed, visualizations) ? [] : [{path: 'layers.userDefinedVisualizations.this-recipe', value: renamed}])
    ]
}

// Each band's name before the commit and after, where they differ: a band is the same where its input and id are, its
// name before matched as the commit matches it (savedBandNames). A band whose saved names cannot be told apart
// renames nothing.
function renamesBetween(previous, bandNames) {
    const before = savedBandNames(previous)
    return bandNames
        .flatMap(({imageId, bands = []}) => {
            const prevBands = before.find(entry => entry.imageId === imageId)?.bands || []
            return bands.map(({id, outputName}) => ({from: prevBands.find(band => band.id === id)?.outputName, to: outputName}))
        })
        .filter(({from, to}) => from && to && from !== to)
}
