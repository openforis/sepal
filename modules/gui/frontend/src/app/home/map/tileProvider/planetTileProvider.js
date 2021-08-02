import {WMTSTileProvider} from './wmtsTileProvider'

export class PlanetTileProvider extends WMTSTileProvider {
    constructor({urlTemplate, tileSize, concurrency}) {
        super({type: 'Planet', urlTemplate, tileSize, concurrency})
    }
}
