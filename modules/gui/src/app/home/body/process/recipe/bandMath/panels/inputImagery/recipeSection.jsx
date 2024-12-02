import PropTypes from 'prop-types'
import React from 'react'

import {getAllVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {RecipeInput} from '~/widget/recipeInput'

export class RecipeSection extends React.Component {
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
        const visualizations = getRecipeType(recipe.type).getPreSetVisualizations(recipe)
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
        const categoricalVisualizations = getAllVisualizations(recipe)
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
    input: PropTypes.object.isRequired
}
