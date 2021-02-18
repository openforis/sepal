import {TileProvider} from './tileProvider'

export class DelegatingTileProvider extends TileProvider {
    constructor(nextTileProvider) {
        super()
        this.nextTileProvider = nextTileProvider
    }

    getType() {
        return this.nextTileProvider.getType()
    }

    getConcurrency() {
        return this.nextTileProvider.getConcurrency()
    }

    loadTile$(tileRequest) {
        return this.nextTileProvider.loadTile$(tileRequest)
    }

    releaseTile(tileElement) {
        return this.nextTileProvider.releaseTile(tileElement)
    }

    hide(hidden) {
        this.nextTileProvider.hide(hidden)
    }

    close() {
        this.nextTileProvider.close()
    }
}
