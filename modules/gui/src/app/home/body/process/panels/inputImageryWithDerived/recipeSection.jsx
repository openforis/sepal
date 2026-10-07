import PropTypes from 'prop-types'
import React from 'react'

import {isTakenSource} from '~/app/home/body/process/inputImages'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
    render() {
        const {input, onLoading, otherSources} = this.props
        return (
            <RecipeInput
                input={input}
                filter={(recipeType, recipe) => isImageSource(recipeType) && !isTakenSource(otherSources, 'RECIPE_REF', recipe.id)}
                autoFocus
                onLoading={onLoading}
                onBandsLoaded={value => this.onRecipeLoaded(value)}
            />
        )
    }

    onRecipeLoaded({recipe, bandNames}) {
        const {onLoaded} = this.props
        onLoaded({
            id: recipe.id,
            bands: bandNames
        })
    }
}

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired,
    // The sources of the recipe's other inputs, which are not offered.
    otherSources: PropTypes.array
}
