import PropTypes from 'prop-types'
import React from 'react'

import {isTakenSource} from '~/app/home/body/process/inputImages'
import {recipeVisualizationsNaming, sourceVisualizations} from '~/app/home/body/process/recipe/visualizations'
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
        const visualizations = sourceVisualizations(recipe)
        onLoaded({
            id: recipe.id,
            bands: this.extractBands(recipe, bandNames),
            visualizations,
            recipe: {
                type: 'RECIPE_REF',
                id: recipe.id
            }
        })
    }

    extractBands(recipe, bandNames) {
        const bands = {}
        const categoricalVisualizations = recipeVisualizationsNaming(recipe, bandNames)
            .filter(({type}) => type === 'categorical')
        bandNames
            .forEach(bandName => {
                const visualization = categoricalVisualizations
                    .find(({bands}) => bands[0] === bandName) || {}
                bands[bandName] = {...visualization}
            })
        return bands
    }
}

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired,
    // The sources of the recipe's other inputs, which are not offered.
    otherSources: PropTypes.array
}
