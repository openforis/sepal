import {Subject} from 'rxjs'
import {compose} from 'compose'
import {finalize} from 'rxjs/operators'
import {v4 as uuid} from 'uuid'
import {withTabContext} from 'widget/tabs/tabContext'
import EarthEngineTableLayer from './layer/earthEngineTableLayer'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'
import withSubscriptions from 'subscription'

class _EETableLayer extends React.Component {
    componentId = uuid()
    progress$ = new Subject()

    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            this.progress$.pipe(
                finalize(() => this.setBusy('tiles', false))
            ).subscribe({
                next: ({complete}) => this.setBusy('tiles', !complete)
            })
        )
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
        const {tableId, columnName, columnValue, buffer, color, fillColor, layerIndex, map} = this.props
        return tableId
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.eeTableMap$({
                    tableId, columnName, columnValue, buffer, color, fillColor
                }),
                layerIndex,
                watchedProps: {tableId, columnName, columnValue, buffer},
                progress$: this.progress$,
                onInitialize: () => this.setBusy('initialize', true),
                onInitialized: () => this.setBusy('initialize', false),
                onError: () => this.setBusy('initialize', false)
            })
            : null
    }

    setBusy(name, busy) {
        const {tabContext: {setBusy}} = this.props
        setBusy(`${name}-${this.componentId}`, busy)
    }
}

export const EETableLayer = compose(
    _EETableLayer,
    withTabContext(),
    withSubscriptions()
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
