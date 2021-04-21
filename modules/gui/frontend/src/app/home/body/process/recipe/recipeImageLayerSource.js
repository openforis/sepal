import {OpticalMosaicImageLayerSource} from './opticalMosaic/opticalMosaicImageLayerSource'
import {compose} from 'compose'
import {connect} from 'store'
import {recipeAccess} from '../recipeAccess'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = (state, {recipeId}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

class _RecipeImageLayerSource extends React.Component {
    state = {}

    render() {
        const {recipe} = this.props
        return recipe
            ? this.renderRecipeMap()
            : null
    }

    renderRecipeMap() {
        const {recipe, layerConfig, map} = this.props
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicImageLayerSource
                recipe={recipe}
                layerConfig={layerConfig}
                map={map}/>
        )
        default: throw Error(`Unsupported recipe type: ${recipe.type}`)
        }
    }

    componentDidMount() {
        this.loadRecipe()
    }

    componentDidUpdate(prevProps) {
        const {recipeId: prevRecipeId} = prevProps
        const {recipeId} = this.props
        if (recipeId !== prevRecipeId) {
            this.loadRecipe()
        }
    }

    loadRecipe() {
        const {stream, recipeId, loadRecipe$} = this.props
        stream('LOAD_RECIPE',
            loadRecipe$(recipeId)
        )
    }
}

export const RecipeImageLayerSource = compose(
    _RecipeImageLayerSource,
    connect(mapStateToProps),
    recipeAccess()
)

RecipeImageLayerSource.propTypes = {
    recipeId: PropTypes.string.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
