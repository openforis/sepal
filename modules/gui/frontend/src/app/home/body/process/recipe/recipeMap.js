import {OpticalMosaicMap} from './opticalMosaic/opticalMosaicMap'
import {compose} from 'compose'
import {connect} from 'store'
import {recipeAccess} from '../recipeAccess'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = (state, {recipeId}) =>
    ({
        recipe: selectFrom(state, ['process.loadedRecipes', recipeId]) || {}
    })

class _RecipeMap extends React.Component {
    state = {}

    render() {
        return this.getRecipe()
            ? this.renderRecipeMap()
            : null
    }

    renderRecipeMap() {
        const {layerConfig, map} = this.props
        const recipe = this.getRecipe()
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
        const {stream, recipeId, recipe, loadRecipe$} = this.props
        console.log('componentDidMount', {recipeId, recipe})
        if (!recipe || !stream('LOAD_RECIPE').active) {
            stream('LOAD_RECIPE',
                loadRecipe$(recipeId),
                recipe => this.setState({recipe})
            )
        }
    }

    getRecipe() {
        return this.props.recipe || this.state.recipe
    }
}

export const RecipeMap = compose(
    _RecipeMap,
    connect(mapStateToProps),
    recipeAccess()
)

RecipeMap.propTypes = {
    recipeId: PropTypes.string.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
