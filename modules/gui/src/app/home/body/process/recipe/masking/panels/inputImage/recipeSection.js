import {RecipeInput} from 'widget/recipeInput'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import PropTypes from 'prop-types'
import React from 'react'

export default class RecipeSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <RecipeInput
                input={input}
                filter={type => !type.noImageOutput}
                autoFocus
                onLoading={onLoading}
                onLoaded={value => this.onRecipeLoaded(value)}
            />
        )
    }

    onRecipeLoaded({recipe, bandNames}) {
        const {onLoaded} = this.props
        onLoaded({
            id: recipe.id,
            bands: bandNames,
            visualizations: getRecipeType(recipe.type).getPreSetVisualizations(recipe)
        })
    }
}

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired
}
