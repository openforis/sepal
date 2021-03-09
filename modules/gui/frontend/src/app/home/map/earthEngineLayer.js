import {EarthEngineTileProvider} from './tileProvider/earthEngineTileProvider'
import {TileLayer} from './googleMaps/googleMapsLayer'
import {mapTo, tap} from 'rxjs/operators'
import {of} from 'rxjs'
import _ from 'lodash'

export default class EarthEngineLayer {
    constructor({mapContext, layerIndex, toggleable, label, description, bounds, mapId$, props, progress$}) {
        this.mapContext = mapContext
        this.layerIndex = layerIndex
        this.toggleable = toggleable
        this.label = label
        this.description = description
        this.bounds = bounds
        this.mapId$ = mapId$
        this.props = props
        this.progress$ = progress$
    }

    equals(o) {
        return _.isEqual(o && o.props, this.props)
    }

    addToMap() {
        const {mapContext, layerIndex, mapId, token, urlTemplate, progress$} = this
        const tileProvider = new EarthEngineTileProvider({mapId, token, urlTemplate})
        this.layer = TileLayer({mapContext, tileProvider, layerIndex, progress$})
        this.layer.add()
    }

    removeFromMap() {
        this.layer && this.layer.remove()
    }

    hide(hidden) {
        this.layer && this.layer.hide(hidden)
    }

    initialize$() {
        return this.mapId
            ? of(this)
            : this.mapId$.pipe(
                tap(({response: {token, mapId, urlTemplate, visParams}}) => {
                    this.token = token
                    this.mapId = mapId
                    this.urlTemplate = urlTemplate
                    this.visParams = visParams
                }),
                mapTo(this)
            )
    }
}
