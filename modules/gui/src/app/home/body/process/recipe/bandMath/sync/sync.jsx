import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'
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
})

class _Sync extends React.Component {
    state = {lint: false}

    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        const {images: prevImages, calculations: prevCalculations} = prevProps
        const {images, calculations, outputImages, recipeActionBuilder} = this.props

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

            // TODO: Update visualizations

            this.setState({lint: true})
        } else if (this.state.lint) {
            this.setState({lint: false}, () =>
                this.lint({images, calculations})
            )
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

