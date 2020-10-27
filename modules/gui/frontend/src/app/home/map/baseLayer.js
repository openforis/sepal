import {NEVER} from 'rxjs'
import GoogleSatelliteLayer from './googleSatelliteLayer'
import WMTSLayer from './wmtsLayer'
import actionBuilder from 'action-builder'

export const changeBaseLayer = ({type, mapContext: {google, googleMap, sepalMap}, statePath, options}) => {
    actionBuilder('SET_BASE_LAYER', {type})
        .set([statePath, 'baseLayer'], type)
        .set([statePath, 'mapLayer'], options)
        .sideEffect(() => {
            const layer = createLayer({google, googleMap, type, options})
            layer
                ? sepalMap.setLayer({id: 'base', layer, destroy$: NEVER})
                : sepalMap.removeLayer('base')

        })
        .build()
        .dispatch()
}

const createLayer = ({google, googleMap, type, options}) => {
    const {proc, dateRange, planetApiKey} = options
    switch (type) {
    case 'SEPAL':
        return null
    case 'GOOGLE_SATELLITE':
        return new GoogleSatelliteLayer({google, googleMap, layerIndex: 0})
    case 'PLANET':
        return new WMTSLayer({
            layerIndex: 0,
            urlTemplate: `https://tiles0.planet.com/basemaps/v1/planet-tiles/planet_medres_normalized_analytic_${dateRange}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey}&proc=${proc}&color=auto`,
            // urlTemplate: `https://tiles.planet.com/basemaps/v1/planet-tiles/global_monthly_${year}_${month}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey}`,
            attribution: 'Planet monthly composite'
        })
    default:
        new Error(`Unsupported base layer type: ${type}`)
    }
}
