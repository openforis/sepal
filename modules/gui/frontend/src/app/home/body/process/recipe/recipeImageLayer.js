import {OpticalMosaicImageLayerSource} from './opticalMosaic/opticalMosaicImageLayerSource'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

class _RecipeImageLayer extends React.Component {
    state = {}

    render() {
        const {recipe} = this.props
        return recipe
            ? this.renderRecipeMap()
            : null
    }

    renderRecipeMap() {
        const {recipe, source, layerConfig, map} = this.props
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicImageLayerSource
                recipe={recipe}
                source={source}
                layerConfig={layerConfig}
                map={map}/>
        )
        default: throw Error(`Unsupported recipe type: ${recipe.type}`)
        }
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps)
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    map: PropTypes.object
}
