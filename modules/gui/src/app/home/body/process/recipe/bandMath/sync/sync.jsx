import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'
import _ from 'lodash'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {eeLint} from '~/widget/codeEditor/eeLint'

import {updateIncludedBands} from '../panels/calculations/calculation'
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
    state = {lint: false}

    render() {
        return null
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

            this.setState({lint: true})
        } else if (this.state.lint) {
            this.setState({lint: false}, () =>
                this.lint({images, calculations})
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

    lint({images, calculations}) {
        calculations
            .filter(({type}) => type === 'EXPRESSION')
            .forEach(calculation => {
                const onBandChanged = ({includedBands}) => {
                    const updatedIncludedBands = updateIncludedBands({...calculation, includedBands})
                    this.setCalculation({...calculation, includedBands: updatedIncludedBands})
                }

                const state = EditorState.create({
                    doc: calculation.expression,
                    extensions: javascript()
                })

                const lintErrors = eeLint([...images, ...calculations], msg, onBandChanged)({state})
                if (lintErrors.length) {
                    this.setCalculation({...calculation, invalid: lintErrors[0].message})
                } else if (calculation.invalid) {
                    this.setCalculation({...calculation, invalid: false})
                }
            })
    }

    setCalculation(calculation) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_BAND_MATH_CALCULATION')
            .set(['model.calculations.calculations', {imageId: calculation.imageId}], calculation)
            .dispatch()
    }
}

export const Sync = compose(
    _Sync,
    withRecipe(mapRecipeToProps)
)

