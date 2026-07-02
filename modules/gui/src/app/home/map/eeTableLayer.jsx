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
        const {id, map} = this.props
        // Drop the previous layer if the id changed under us, so a reused component can't strand tiles.
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
        const {tableId, columnName, columnValue, buffer, color, fillColor, pointSize, width, layerIndex, map, tab: {busy}} = this.props
        return tableId
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.eeTableMap$({
                    tableId, columnName, columnValue, buffer, color, fillColor, pointSize, width
                }),
                layerIndex,
                watchedProps: {tableId, columnName, columnValue, buffer, color, fillColor, pointSize, width},
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
    layerIndex: PropTypes.number,
    map: PropTypes.any,
    pointSize: PropTypes.number,
    tableId: PropTypes.string,
    width: PropTypes.number
}
