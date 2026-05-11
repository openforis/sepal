import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {collectDependentHashes} from '../body/process/recipe/dependentHashes'
import {EarthEngineTableLayer} from './layer/earthEngineTableLayer'

const mapStateToProps = (state, {recipe}) => ({
    dependentHashes: recipe ? collectDependentHashes(state, recipe) : {}
})

class _RecipeGeometryLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate() {
        this.setLayer()
    }

    componentWillUnmount() {
        const {id, map} = this.props
        map.removeLayer(id)
    }

    setLayer() {
        const {id, map} = this.props
        const layer = this.createLayer()
        if (layer) {
            map.setLayer({id, layer})
        }
    }

    createLayer() {
        const {recipe, dependentHashes, color, fillColor, layerIndex, map, tab: {busy}} = this.props
        return recipe.ui.initialized
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.recipeGeometry$({
                    recipe, color, fillColor
                }),
                layerIndex,
                watchedProps: {model: recipe.model, dependentHashes},
                busy
            })
            : null
    }
}

export const RecipeGeometryLayer = compose(
    _RecipeGeometryLayer,
    connect(mapStateToProps),
    withTab(),
    withSubscriptions()
)

RecipeGeometryLayer.propTypes = {
    color: PropTypes.string.isRequired,
    fillColor: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number.isRequired,
    map: PropTypes.any.isRequired,
    recipe: PropTypes.object.isRequired
}
