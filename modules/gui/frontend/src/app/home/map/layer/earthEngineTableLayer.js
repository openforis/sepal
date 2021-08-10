import {EarthEngineTableTileProvider} from '../tileProvider/earthEngineTableTileProvider'
import EarthEngineLayer from './earthEngineLayer'

export default class EarthEngineTableLayer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, watchedProps, progress$, onInitialize, onInitialized, onError}) {
        super({map, mapId$, layerIndex, watchedProps, progress$, onInitialize, onInitialized, onError})
    }

    createTileProvider() {
        const {urlTemplate} = this
        return new EarthEngineTableTileProvider({urlTemplate})
    }
}
