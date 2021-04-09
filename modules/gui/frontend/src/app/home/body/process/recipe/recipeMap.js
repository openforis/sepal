import {OpticalMosaicMap} from './opticalMosaic/opticalMosaicMap'
import {compose} from 'compose'
import {connect} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const mapStateToProps = () => ({

})

class _RecipeMap extends React.Component {
    state = {}

    render() {
        const {recipe} = this.state
        return recipe
            ? this.renderRecipeMap()
            : null
    }

    renderRecipeMap() {
        const {layerConfig, map} = this.props
        const {recipe} = this.state
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicMap
                recipe={recipe}
                layerConfig={layerConfig}
                map={map}/>
        )
        default: throw Error(`Unsupported recipe type: ${recipe.type}`)
        }
    }

    componentDidMount() {
        const {stream, recipeId} = this.props
        stream('LOAD_RECIPE',
            loadRecipe$(recipeId),
            recipe => this.setState({recipe})
        )
    }
}

export const RecipeMap = compose(
    _RecipeMap,
    connect(mapStateToProps),
)

// TODO: Don't load this every time - pick it up from Redux state cache
const loadRecipe$ = recipeId => api.recipe.load$(recipeId)

RecipeMap.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    map: PropTypes.object
}
