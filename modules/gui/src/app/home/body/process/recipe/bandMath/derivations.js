import _ from 'lodash'

import {CALCULATION_REFERENCES, calculationItem, chainFacts} from './chainRequirements'
import {updateIncludedBands} from './panels/calculations/calculation'
import {outputNameOf} from './panels/outputBands/outputImages'
import {findChanges} from './sync/findChanges'
import {updateCalculation} from './sync/updateCalculation'
import {updateOutputBands} from './sync/updateOutputBands'

// What Band Math derives locally (derivedResult.js): the bands each calculation yields, kept derived in the applied recipe
// by every commit, whichever editor commits it or none. In calculation order, a calculation follows the renames of what it
// reads into its expression, and is derived from the inputs and the calculations before it as just derived - only where
// it and every calculation it reads are met, and what it reads has changed. One that is not keeps the bands it was derived
// with, and with them the names its outputs were given, until it is met again. Outputs and visualizations then follow
// the bands: what the commit removed, added and renamed. Nothing is acquired: configuration alone is read.

export const CALCULATION_BANDS_DERIVATION = 'bandMath.calculationBands'

export const bandMathDerivations = [
    {
        id: CALCULATION_BANDS_DERIVATION,
        applied: {
            items: 'calculations.calculations',
            read: (model, index) => calculationItem(chainFacts({model}), index),
            requirement: CALCULATION_REFERENCES,
            inputs: calculationInputs,
            follow: followedReferences,
            derive: derivedBands,
            followRecipe: followedOutputs
        }
    }
]

// Its own settings, and the bands its analysis finds it reading: not the rest of its scope.
function calculationInputs({facts: {analysis}}, {type, expression, usedBands, bandName, bandRenameStrategy, regex, bandRename}) {
    return {
        type, expression, bandName, bandRenameStrategy, regex, bandRename,
        reads: analysis ? _.pick(analysis, ['diagnostics', 'usedBands', 'includedBands']) : usedBands
    }
}

function followedReferences(calculation, {previous, model}) {
    return updateCalculation({changes: changesBetween(previous, model), calculations: [calculation]})[0]
}

function derivedBands(calculation, {facts: {analysis}}) {
    if (calculation.type !== 'EXPRESSION') {
        return calculation
    }
    const includedBands = updateIncludedBands({...calculation, includedBands: analysis.includedBands})
    return isSame(includedBands, calculation.includedBands)
        ? calculation
        : {...calculation, includedBands}
}

function followedOutputs(previous, recipe) {
    const {outputImages} = chainFacts(recipe)
    const followed = updateOutputBands({changes: changesBetween(previous.model, recipe.model), outputImages})
    const visualizations = recipe.layers?.userDefinedVisualizations?.['this-recipe'] || []
    const renamed = renamedVisualizations(visualizations, chainFacts(previous).outputImages, followed)
    return [
        ...(_.isEqual(followed, outputImages) ? [] : [{path: 'model.outputBands.outputImages', value: followed}]),
        ...(_.isEqual(renamed, visualizations) ? [] : [{path: 'layers.userDefinedVisualizations.this-recipe', value: renamed}])
    ]
}

function changesBetween(previous, model) {
    const {images: prevImages, calculations: prevCalculations} = chainFacts({model: previous})
    const {images, calculations} = chainFacts({model})
    return findChanges({prevImages, images, prevCalculations, calculations})
}

// A visualization reading a band whose output name changed reads it by its new one. A band is the same output where its
// output image and its id are: the copies two calculations output of one band carry the same metadata.
function renamedVisualizations(visualizations, prevOutputImages, outputImages) {
    const renamedBands = outputImages
        .flatMap(({imageId, outputBands}) => {
            const prevOutputBands = prevOutputImages.find(prevOutputImage => prevOutputImage.imageId === imageId)?.outputBands || []
            return outputBands.map(band => {
                const prevBand = prevOutputBands.find(prevBand => prevBand.id === band.id)
                return {prevBandName: prevBand ? outputNameOf(prevBand) : null, bandName: outputNameOf(band)}
            })
        })
        .filter(({prevBandName, bandName}) => prevBandName && prevBandName !== bandName)
    return renamedBands.length
        ? visualizations.map(visualization => ({
            ...visualization,
            bands: visualization.bands.map(band => {
                const renamedBand = renamedBands.find(({prevBandName}) => prevBandName === band)
                return renamedBand ? renamedBand.bandName : band
            })
        }))
        : visualizations
}

// As the model holds them: a field left undefined is not held.
function isSame(a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
}
