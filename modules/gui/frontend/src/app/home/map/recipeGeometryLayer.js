import {compose} from 'compose'
import {connect} from 'store'
import EarthEngineTableLayer from './layer/earthEngineTableLayer'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

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
        const {id, map, componentWillUnmount$} = this.props
        const layer = this.createLayer()
        if (layer) {
            map.setLayer({
                id,
                layer,
                destroy$: componentWillUnmount$
            })
        }
    }

    createLayer() {
        const {recipe, color, fillColor, layerIndex, map} = this.props
        return recipe.ui.initialized
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.recipeGeometry$({
                    recipe, color, fillColor
                }),
                layerIndex,
                watchedProps: recipe.model
            })
            : null
    }
}

export const RecipeGeometryLayer = compose(
    _RecipeGeometryLayer,
    connect()
)

RecipeGeometryLayer.propTypes = {
    color: PropTypes.string.isRequired,
    fillColor: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number.isRequired,
    map: PropTypes.any.isRequired,
    recipe: PropTypes.object.isRequired
}
