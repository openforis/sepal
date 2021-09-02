import TileLayer from './tileLayer'

export default class WMTSLayer extends TileLayer {
    constructor({map, urlTemplate, concurrency, busy$}) {
        super({map, busy$})
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
