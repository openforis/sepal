import {OpticalMosaicMap} from './opticalMosaic/opticalMosaicMap'
import {compose} from 'compose'
import {connect} from 'store'
import {of} from 'rxjs'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const mapStateToProps = state => {
    return ({
        loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {}
    })
}

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
        const {stream} = this.props
        stream('LOAD_RECIPE',
            this.loadRecipe$(),
            recipe => this.setState({recipe})
        )
    }

    loadRecipe$() {
        const {recipeId, loadedRecipes} = this.props
        const recipe = loadedRecipes[recipeId]
        return recipe
            ? of(recipe)
            : api.recipe.load$(recipeId)
    }
}

export const RecipeMap = compose(
    _RecipeMap,
    connect(mapStateToProps),
)

RecipeMap.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    map: PropTypes.object
}
