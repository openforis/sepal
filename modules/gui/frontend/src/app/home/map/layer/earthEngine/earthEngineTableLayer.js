import {EarthEngineTableTileProvider} from '../../tileProvider/earthEngineTableTileProvider'
import EarthEngineLayer from './earthEngineLayer'

export default class EarthEngineTableLayer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, watchedProps}) {
        super({map, mapId$, layerIndex, watchedProps})
    }

    createTileProvider() {
        const {urlTemplate} = this
        return new EarthEngineTableTileProvider({urlTemplate})
    }
}
