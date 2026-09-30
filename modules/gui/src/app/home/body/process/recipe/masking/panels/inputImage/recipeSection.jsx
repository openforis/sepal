import PropTypes from 'prop-types'
import React from 'react'

import {mayProvideSegments} from '#sepal/recipe/capability/ccdcSegments'
import {sourceVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {RecipeInput} from '~/widget/recipeInput'

// Masking preserves what it masks, so a source of segments stays one through it, whether or not it is offered as an
// image elsewhere.
export const maskableImage = (type, recipe) =>
    isImageSource(type) || mayProvideSegments(recipe.type)

// A mask is read as an ordinary image. Standing for segments says nothing about being usable as one.
export const maskImage = type =>
    isImageSource(type)

export class RecipeSection extends React.Component {
    render() {
        const {input, filter, onLoading} = this.props
        return (
            <RecipeInput
                input={input}
                filter={filter}
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
            bands: bandNames,
            visualizations: sourceVisualizations(recipe)
        })
    }
}

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired,
    filter: PropTypes.func
}
