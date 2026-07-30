import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {EarthEngineTableLayer} from './layer/earthEngineTableLayer'

class _EETableLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate(prevProps) {
        const {id, map, opacity} = this.props
        // Drop the previous layer if the id changed under us, so a reused component can't strand tiles.
        if (prevProps.id !== id) {
            map.removeLayer(prevProps.id)
        }
        // Opacity is client-side only and deliberately excluded from watchedProps, so an opacity-only change
        // leaves the layer equal (no recreation, no eeTableMap$/map-id refetch). Push the new opacity onto the
        // live layer's tiles directly. If other inputs also changed, setLayer() below recreates the layer with
        // the current opacity anyway.
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
        const {tableId, columnName, columnValue, buffer, color, fillColor, pointSize, width, style, featureFilter, opacity, layerIndex, map, tab: {busy}} = this.props
        return tableId
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.eeTableMap$({
                    tableId, columnName, columnValue, buffer, color, fillColor, pointSize, width, style, featureFilter
                }),
                opacity,
                layerIndex,
                // opacity is intentionally excluded: it's applied client-side (setOpacity), so an opacity-only
                // change stays equal and doesn't recreate the layer or refetch the map id.
                watchedProps: {tableId, columnName, columnValue, buffer, color, fillColor, pointSize, width, style, featureFilter},
                busy
            })
            : null
    }
}

export const EETableLayer = compose(
    _EETableLayer,
    withTab(),
    withSubscriptions()
)

EETableLayer.propTypes = {
    id: PropTypes.string.isRequired,
    buffer: PropTypes.number,
    color: PropTypes.string,
    columnName: PropTypes.string,
    columnValue: PropTypes.any,
    fillColor: PropTypes.string,
    featureFilter: PropTypes.object,
    layerIndex: PropTypes.number,
    map: PropTypes.any,
    opacity: PropTypes.number,
    pointSize: PropTypes.number,
    style: PropTypes.object,
    tableId: PropTypes.string,
    width: PropTypes.number
}
