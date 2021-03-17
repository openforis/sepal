import {NEVER} from 'rxjs'
import GoogleSatelliteLayer from './googleSatelliteLayer'
import WMTSLayer from './wmtsLayer'
import actionBuilder from 'action-builder'

export const changeBaseLayer = ({type, map, statePath, options}) => {
    actionBuilder('SET_BASE_LAYER', {type})
        .set([statePath, 'baseLayer'], type)
        .set([statePath, 'mapLayer'], options)
        .sideEffect(() => {
            const layer = createLayer({map, type, options})
            layer
                ? map.setLayer({id: 'base', layer, destroy$: NEVER})
                : map.removeLayer('base')

        })
        .dispatch()
}

const createLayer = ({map, type, options}) => {
    const {proc, dateRange, planetApiKey} = options
    switch (type) {
    case 'SEPAL':
        return null
    case 'GOOGLE_SATELLITE':
        return new GoogleSatelliteLayer({map, layerIndex: 0})
    case 'PLANET':
        return new WMTSLayer({
            map,
            layerIndex: 0,
            urlTemplate: `https://tiles0.planet.com/basemaps/v1/planet-tiles/planet_medres_normalized_analytic_${dateRange}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey}&proc=${proc}&color=auto`
            // urlTemplate: `https://tiles.planet.com/basemaps/v1/planet-tiles/global_monthly_${year}_${month}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey}`
        })
    default:
        new Error(`Unsupported base layer type: ${type}`)
    }
}
