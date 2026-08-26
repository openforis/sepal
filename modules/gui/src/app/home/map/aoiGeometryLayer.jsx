import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {EarthEngineTableLayer} from './layer/earthEngineTableLayer'

// A geometry aoi is renderable once it carries what the server's toGeometry$ needs: a referenced id
// (ASSET/RECIPE) or a drawn path (POLYGON).
export const hasAoiGeometry = aoi => !!(aoi?.id || aoi?.path?.length)

class _AoiGeometryLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate(prevProps) {
        const {id, map, opacity} = this.props
        if (prevProps.id !== id) {
            map.removeLayer(prevProps.id)
        }
        // Opacity is client-side only and deliberately excluded from watchedProps, so an opacity-only change
        // leaves the layer equal (no recreation, no map-id refetch). Push the new opacity onto the live
        // layer's tiles directly.
        if (prevProps.opacity !== opacity) {
            map.getLayer(id)?.setOpacity?.(opacity)
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
        const {aoi, color, fillColor, width, opacity, layerIndex, map, tab: {busy}} = this.props
        return hasAoiGeometry(aoi)
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.aoiGeometry$({
                    aoi, color, fillColor, width
                }),
                opacity,
                layerIndex,
                // opacity is intentionally excluded: it's applied client-side (setOpacity), so an
                // opacity-only change stays equal and doesn't recreate the layer or refetch the map id.
                watchedProps: {aoi, color, fillColor, width},
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
    map: PropTypes.any.isRequired,
    opacity: PropTypes.number,
    width: PropTypes.number
}
