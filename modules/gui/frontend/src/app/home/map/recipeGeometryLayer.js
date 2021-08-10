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

class _RecipeGeometryLayer extends React.Component {
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
        const {recipe, color, fillColor, layerIndex, map} = this.props
        return recipe.ui.initialized
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.recipeGeometry$({
                    recipe, color, fillColor
                }),
                layerIndex,
                watchedProps: recipe.model,
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

export const RecipeGeometryLayer = compose(
    _RecipeGeometryLayer,
    withTabContext(),
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
