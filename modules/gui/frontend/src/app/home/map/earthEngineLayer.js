import {EarthEngineTileProvider} from './tileProvider/earthEngineTileProvider'
import {Subject, of} from 'rxjs'
import {TileLayer} from './googleMaps/googleMapsLayer'
import {mapTo, tap} from 'rxjs/operators'
import _ from 'lodash'
import api from 'api'

export default class EarthEngineLayer {
    static fromRecipe({recipe, layerConfig, map}) {
        const previewRequest = {
            recipe: _.omit(recipe, ['ui']),
            ...layerConfig
        }
        return new EarthEngineLayer({
            map,
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            progress$: new Subject()
        })
    }

    constructor({map, layerIndex = 0, toggleable, label, description, mapId$, props, progress$}) {
        this.map = map
        this.layerIndex = layerIndex
        this.toggleable = toggleable
        this.label = label
        this.description = description
        this.mapId$ = mapId$
        this.props = props
        this.progress$ = progress$
    }

    equals(o) {
        return _.isEqual(o && o.props, this.props)
    }

    addToMap() {
        const {map, layerIndex, mapId, token, urlTemplate, progress$} = this
        const tileProvider = new EarthEngineTileProvider({mapId, token, urlTemplate})
        this.layer = TileLayer({map, tileProvider, layerIndex, progress$})
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
