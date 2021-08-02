import TileLayer from './tileLayer'

export default class WMTSLayer extends TileLayer {
    constructor({map, urlTemplate, concurrency, progress$}) {
        super({map, progress$})
        this.urlTemplate = urlTemplate
        this.concurrency = concurrency
    }

    equals(o) {
        return this.urlTemplate === o.urlTemplate
    }
}
