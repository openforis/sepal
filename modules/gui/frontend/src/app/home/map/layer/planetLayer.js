import {PlanetTileProvider} from '../tileProvider/planetTileProvider'
import WMTSLayer from './wmtsLayer'

export default class PlanetLayer extends WMTSLayer {
    constructor({map, urlTemplate, concurrency, busy$}) {
        super({map, urlTemplate, concurrency, busy$})
    }

    createTileProvider() {
        const {urlTemplate, concurrency} = this
        return new PlanetTileProvider({urlTemplate, concurrency})
    }
}
