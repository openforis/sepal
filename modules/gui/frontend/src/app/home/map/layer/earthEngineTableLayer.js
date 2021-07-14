import {EarthEngineTableTileProvider} from '../tileProvider/earthEngineTableTileProvider'
import EarthEngineLayer from './earthEngineLayer'

export default class EarthEngineTableLayer extends EarthEngineLayer {
    constructor(args) {
        super(args)
    }

    createTileProvider() {
        const {urlTemplate} = this
        return new EarthEngineTableTileProvider({urlTemplate})
    }
}
