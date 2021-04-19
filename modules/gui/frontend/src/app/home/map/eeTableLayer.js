import {compose} from 'compose'
import {connect} from 'store'
import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

class _EETableLayer extends React.Component {
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
        const {tableId, columnName, columnValue, buffer, color, fillColor, layerIndex, map} = this.props
        return tableId
            ? new Layer({
                map,
                mapId$: api.gee.eeTableMap$({
                    tableId, columnName, columnValue, buffer, color, fillColor
                }),
                layerIndex,
                watchedProps: {tableId, columnName, columnValue, buffer}
            })
            : null
    }
}

export const EETableLayer = compose(
    _EETableLayer,
    connect()
)

EETableLayer.propTypes = {
    id: PropTypes.string.isRequired,
    buffer: PropTypes.number,
    columnName: PropTypes.string,
    columnValue: PropTypes.any,
    layerIndex: PropTypes.number,
    map: PropTypes.any,
    tableId: PropTypes.string
}

class Layer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, watchedProps}) {
        super({map, layerIndex, mapId$, props: watchedProps})
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
