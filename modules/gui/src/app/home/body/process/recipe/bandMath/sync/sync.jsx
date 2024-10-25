import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'

import {findChanges} from './findChanges'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images'),
    calculations: selectFrom(recipe, 'model.calculations.calculations'),
    outputBands: selectFrom(recipe, 'model.outputBands.outputImages'),
})

class _Sync extends React.Component {
    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        const {images: prevImages, calculations: prevCalculations} = prevProps
        const {images, calculations, outputBands} = this.props

        const changes = findChanges({prevImages, images, prevCalculations, calculations})
        // console.log(changes)
    }
}

export const Sync = compose(
    _Sync,
    withRecipe(mapRecipeToProps)
)

