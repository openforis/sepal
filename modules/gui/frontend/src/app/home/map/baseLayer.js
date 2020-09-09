import {NEVER} from 'rxjs'
import {sepalMap} from 'app/home/map/map'
import actionBuilder from 'action-builder'
import GoogleSatelliteLayer from './googleSatelliteLayer'
import WMTSLayer from './wmtsLayer'

export const changeBaseLayer = ({type, mapContext, statePath}) => {
    actionBuilder('SET_BASE_LAYER', {type})
        .set([statePath, 'baseLayer'], type)
        .sideEffect(() => {
            const layer = createLayer(type)
            const context = sepalMap.getContext(mapContext)
            layer
                ? context.setLayer({id: 'base', layer, destroy$: NEVER})
                : context.removeLayer('base')

        })
        .build()
        .dispatch()
}

const createLayer = (type) => {
    switch (type) {
        case 'SEPAL':
            return null
        case 'GOOGLE_SATELLITE':
            return new GoogleSatelliteLayer(0)
        case 'SENTINEL_2':
            return new WMTSLayer({
                layerIndex: 0,
                urlTemplate: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2019_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
                attribution: 'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2019)'
            })
        default:
            new Error('Unsupported base layer type: ' + type)
    }
}