import {EarthEngineTableTileProvider} from './tileProvider/earthEngineTableTileProvider'
import {compose} from 'compose'
import {connect} from 'store'
import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
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
            ? new Layer({
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

class Layer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, watchedProps}) {
        super({map, layerIndex, mapId$, props: watchedProps})
    }

    createTileProvider() {
        const {urlTemplate} = this
        return new EarthEngineTableTileProvider({urlTemplate})
    }

    initialize$() {
        if (this.token)
            return of(this)
        return this.mapId$.pipe(
            map(({token, mapId, urlTemplate}) => {
                this.token = token
                this.mapId = mapId
                this.urlTemplate = urlTemplate
                return this
            })
        )
    }
}
