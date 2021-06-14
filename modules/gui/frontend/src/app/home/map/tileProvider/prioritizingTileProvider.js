import {DelegatingTileProvider} from './delegatingTileProvider'
import {getTileManager} from '../tileManager/tileManager'

export class PrioritizingTileProvider extends DelegatingTileProvider {
    constructor(nextTileProvider) {
        super(nextTileProvider)
        this.tileManager = getTileManager(nextTileProvider)
    }

    getType() {
        return this.tileManager.getType()
    }

    getConcurrency() {
        return this.tileManager.getConcurrency()
    }

    loadTile$(tileRequest) {
        return this.tileManager.loadTile$(tileRequest)
    }

    releaseTile(element) {
        this.tileManager.releaseTile(element.id)
        super.releaseTile(element)
    }

    hide(hidden) {
        this.tileManager.hide(hidden)
    }

    close() {
        this.tileManager.close()
    }
}
