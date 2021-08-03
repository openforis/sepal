import TileLayer from './tileLayer'

export default class WMTSLayer extends TileLayer {
    constructor({map, urlTemplate, concurrency, progress$}) {
        super({map, progress$})
        this.urlTemplate = urlTemplate
        this.concurrency = concurrency
    }

    equals(o) {
        return o === this || (
            o instanceof WMTSLayer &&
            o.urlTemplate === this.urlTemplate &&
            o.concurrency === this.concurrency
        )
    }
}
