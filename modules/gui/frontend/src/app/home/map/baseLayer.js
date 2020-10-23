import {NEVER} from 'rxjs'
import {sepalMap} from 'app/home/map/map'
import actionBuilder from 'action-builder'
import GoogleSatelliteLayer from './googleSatelliteLayer'
import WMTSLayer from './wmtsLayer'
import moment from 'moment'

export const changeBaseLayer = ({type, mapContext, statePath, options}) => {
    actionBuilder('SET_BASE_LAYER', {type})
        .set([statePath, 'baseLayer'], type)
        .set([statePath, 'options'], options)
        .sideEffect(() => {
            const layer = createLayer(type, options)
            const context = sepalMap.getContext(mapContext)
            layer
                ? context.setLayer({id: 'base', layer, destroy$: NEVER})
                : context.removeLayer('base')

        })
        .build()
        .dispatch()
}

const createLayer = (type, options) => {
    switch (type) {
        case 'SEPAL':
            return null
        case 'GOOGLE_SATELLITE':
            return new GoogleSatelliteLayer(0)
        case 'PLANET':
            // const {proc, year, month, planetApiKey} = options
            const {proc, dateRange, planetApiKey} = options
            return new WMTSLayer({
                layerIndex: 0,
                urlTemplate: `https://tiles0.planet.com/basemaps/v1/planet-tiles/planet_medres_normalized_analytic_${dateRange}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey}&proc=${proc}&color=auto`,
                // urlTemplate: `https://tiles.planet.com/basemaps/v1/planet-tiles/global_monthly_${year}_${month}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey}`,
                attribution: 'Planet monthly composite'
            })
        default:
            new Error('Unsupported base layer type: ' + type)
    }
}