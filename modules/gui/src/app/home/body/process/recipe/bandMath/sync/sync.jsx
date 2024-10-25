import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'

import {findChanges} from './findChanges'
import {updateOutputBands} from './updateOutputBands'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images'),
    calculations: selectFrom(recipe, 'model.calculations.calculations'),
    outputImages: selectFrom(recipe, 'model.outputBands.outputImages'),
})

class _Sync extends React.Component {
    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        const {images: prevImages, calculations: prevCalculations, recipeActionBuilder} = prevProps
        const {images, calculations, outputImages} = this.props

        const changes = findChanges({prevImages, images, prevCalculations, calculations})
        if (Object.values(changes).find(change => change.length)) {
            const updatedOutputImages = updateOutputBands({changes, outputImages})
            if (updatedOutputImages) {
                recipeActionBuilder('UPDATE_BAND_MATH_OUTPUT_BANDS')
                    .set('model.outputBands.outputImages', updatedOutputImages)
                    .dispatch()
            }
        }
    }
}

export const Sync = compose(
    _Sync,
    withRecipe(mapRecipeToProps)
)

