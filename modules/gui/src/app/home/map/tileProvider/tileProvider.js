import {uuid} from '~/uuid'

export class TileProvider {
    id = uuid()

    getType() {
        this.abstractMethodError('getType')
    }

    getConcurrency() {
        // this.abstractMethodError('getConcurrency')
    }

    createElement(id, doc) {
        const element = doc.createElement('div')
        element.id = id
        return element
    }

    loadTile$(_tileRequest) {
        this.abstractMethodError('loadTile$')
    }

    renderTile({element, blob}) {
        element.innerHTML = `<img src="${(window.URL || window.webkitURL).createObjectURL(blob)}"/>`
    }

    renderErrorTile({_element, _error}) {
        // this.abstractMethodError('renderErrorTile')
    }

    releaseTile(_tileElement) {
        // this.abstractMethodError('releaseTile')
    }

    setVisibility(_visible) {
        // this.abstractMethodError('setVisibility')
    }

    close() {
        // this.abstractMethodError('close')
    }

    abstractMethodError(method) {
        throw Error(`${method} is expected to be overridden by subclass.`)
    }
}
