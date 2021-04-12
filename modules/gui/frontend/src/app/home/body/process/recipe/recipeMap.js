import {OpticalMosaicMap} from './opticalMosaic/opticalMosaicMap'
import {compose} from 'compose'
import {connect} from 'store'
import {recipeAccess} from '../recipeAccess'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'

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
        const {stream, recipeId, loadRecipe$} = this.props
        stream('LOAD_RECIPE',
            loadRecipe$(recipeId),
            recipe => this.setState({recipe})
        )
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
