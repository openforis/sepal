import _ from 'lodash'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'

import {deriveCalculations} from './deriveCalculations'
import {findChanges} from './findChanges'
import {updateCalculation} from './updateCalculation'
import {updateOutputBands} from './updateOutputBands'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images'),
    calculations: selectFrom(recipe, 'model.calculations.calculations'),
    outputImages: selectFrom(recipe, 'model.outputBands.outputImages'),
    userDefinedVisualizations: selectFrom(recipe, 'layers.userDefinedVisualizations.this-recipe') || []
})

class _Sync extends React.Component {
    state = {derive: false}

    render() {
        return null
    }

    shouldComponentUpdate(nextProps, nextState) {
        const {images, calculations, outputImages} = this.props
        const {images: nextImages, calculations: nextCalculations, outputImages: nextOutputImages} = nextProps
        const changed = !_.isEqual(images, nextImages)
            || !_.isEqual(calculations, nextCalculations)
            || !_.isEqual(outputImages, nextOutputImages)
        return changed || nextState.derive
    }

    componentDidUpdate(prevProps) {
        const {images: prevImages, calculations: prevCalculations, outputImages: prevOutputImages} = prevProps
        const {images, calculations, outputImages, userDefinedVisualizations, recipeActionBuilder} = this.props

        const changes = findChanges({prevImages, images, prevCalculations, calculations})
        if (Object.values(changes).find(change => change.length)) {
            const updatedOutputImages = updateOutputBands({changes, outputImages})
            if (updatedOutputImages) {
                recipeActionBuilder('UPDATE_BAND_MATH_OUTPUT_BANDS')
                    .set('model.outputBands.outputImages', updatedOutputImages)
                    .dispatch()
            }
            const updatedCalculations = updateCalculation({changes, calculations})
            recipeActionBuilder('UPDATE_BAND_MATH_OUTPUT_BANDS')
                .set('model.calculations.calculations', updatedCalculations)
                .dispatch()

            this.setState({derive: true})
        } else if (this.state.derive) {
            this.setState({derive: false}, () =>
                this.deriveCalculations({images, calculations})
            )
        }

        if (!_.isEqual(prevOutputImages, outputImages)) {
            const toOutputBands = images => images
                .map(({outputBands}) => outputBands)
                .flat()
            
            const prevOutputBands = toOutputBands(prevOutputImages)
            const outputBands = toOutputBands(outputImages)
            const renamedBands = outputBands
                .map(band => {
                    const prevBand = prevOutputBands.find(prevBand => prevBand.imageId === band.imageId && prevBand.id === band.id)
                    return {
                        prevBandName: prevBand ? prevBand.outputName || prevBand.defaultOutputName : null,
                        bandName: band.outputName || band.defaultOutputName
                    }
                })
                .filter(({prevBandName, bandName}) => prevBandName && prevBandName !== bandName)
            if (renamedBands.length) {
                const updatedVisualizations = userDefinedVisualizations.map(visualization => ({
                    ...visualization,
                    bands: visualization.bands.map(band => {
                        const renamedBand = renamedBands.find(({prevBandName}) => prevBandName === band)
                        return renamedBand
                            ? renamedBand.bandName
                            : band
                    })
                }))
                recipeActionBuilder('UPDATE_BAND_MATH_VISUALIZATIONS')
                    .set('layers.userDefinedVisualizations.this-recipe', updatedVisualizations)
                    .dispatch()
            }
        }
    }

    // What the calculations yield, derived again once the changes they follow have settled, published at once.
    deriveCalculations({images, calculations}) {
        const {recipeActionBuilder} = this.props
        const derived = deriveCalculations({images, calculations})
        if (derived.some((calculation, index) => calculation !== calculations[index])) {
            recipeActionBuilder('UPDATE_BAND_MATH_CALCULATIONS')
                .set('model.calculations.calculations', derived)
                .dispatch()
        }
    }
}

export const Sync = compose(
    _Sync,
    withRecipe(mapRecipeToProps)
)

