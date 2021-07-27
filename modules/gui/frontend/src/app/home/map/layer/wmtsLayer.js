import {WMTSTileProvider} from '../tileProvider/wmtsTileProvider'
import Layer from './layer'

export default class WMTSLayer extends Layer {
    constructor({map, urlTemplate, concurrency, progress$}) {
        super({map, progress$})
        this.urlTemplate = urlTemplate
        this.concurrency = concurrency
    }

    equals(o) {
        return this.urlTemplate === o.urlTemplate
    }

    createTileProvider() {
        const {urlTemplate, concurrency} = this
        return new WMTSTileProvider({type: 'Planet', urlTemplate, concurrency})
    }
}
