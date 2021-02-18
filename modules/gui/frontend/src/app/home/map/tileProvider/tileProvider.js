import {v4 as uuid} from 'uuid'

export class TileProvider {
    id = uuid()

    getType() {
        this.abstractMethodError('getType')
    }

    getConcurrency() {
        // this.abstractMethodError('getConcurrency')
    }

    loadTile$(_tileRequest) {
        this.abstractMethodError('loadTile$')
    }

    releaseTile(_tileElement) {
        // this.abstractMethodError('releaseTile')
    }

    hide(_hidden) {
        // this.abstractMethodError('hide')
    }

    close() {
        // this.abstractMethodError('close')
    }

    abstractMethodError(method) {
        throw Error(`${method} is expected to be overridden by subclass.`)
    }
}
