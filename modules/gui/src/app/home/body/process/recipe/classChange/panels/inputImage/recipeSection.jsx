import PropTypes from 'prop-types'
import React from 'react'

import {recipeVisualizationsNaming} from '~/app/home/body/process/recipe/visualizations'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <RecipeInput
                input={input}
                filter={isImageSource}
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
            bands: this.extractBands(recipe, bandNames),
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
    recipes: PropTypes.array
}
