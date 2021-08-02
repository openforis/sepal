import {PlanetTileProvider} from '../tileProvider/planetTileProvider'
import WMTSLayer from './wmtsLayer'

export default class PlanetLayer extends WMTSLayer {
    constructor({map, urlTemplate, concurrency, progress$}) {
        super({map, urlTemplate, concurrency, progress$})
    }

    createTileProvider() {
        const {urlTemplate, concurrency} = this
        return new PlanetTileProvider({urlTemplate, concurrency})
    }
}
