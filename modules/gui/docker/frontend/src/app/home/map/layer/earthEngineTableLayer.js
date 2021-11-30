import {EarthEngineTableTileProvider} from '../tileProvider/earthEngineTableTileProvider'
import EarthEngineLayer from './earthEngineLayer'

export default class EarthEngineTableLayer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, watchedProps, busy$}) {
        super({map, mapId$, layerIndex, watchedProps, busy$})
    }

    createTileProvider() {
        const {urlTemplate} = this
        return new EarthEngineTableTileProvider({urlTemplate})
    }
}
