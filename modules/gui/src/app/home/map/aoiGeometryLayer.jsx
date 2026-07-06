import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {EarthEngineTableLayer} from './layer/earthEngineTableLayer'

class _AoiGeometryLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate(prevProps) {
        const {id, map} = this.props
        if (prevProps.id !== id) {
            map.removeLayer(prevProps.id)
        }
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
        const {aoi, color, fillColor, layerIndex, map, tab: {busy}} = this.props
        return aoi?.id
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.aoiGeometry$({
                    aoi, color, fillColor
                }),
                layerIndex,
                watchedProps: {aoi, color, fillColor},
                busy
            })
            : null
    }
}

export const AoiGeometryLayer = compose(
    _AoiGeometryLayer,
    withTab(),
    withSubscriptions()
)

AoiGeometryLayer.propTypes = {
    aoi: PropTypes.object.isRequired,
    color: PropTypes.string.isRequired,
    fillColor: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number.isRequired,
    map: PropTypes.any.isRequired
}
