import {TileProvider} from './tileProvider'
import {getTileManager} from '../tileManager/tileManager'

export class BalancingTileProvider extends TileProvider {
    // constructor({tileProvider, retryCutOffTime, busy$, renderingEnabled$, renderingStatus$}) {
    constructor({tileProvider, retryCutOffTime, busy, renderingEnabled$, renderingStatus$}) {
        super()
        this.subscriptions = []
        this.retryCutOffTime = retryCutOffTime
        this.tileProvider = tileProvider
        this.tileManager = getTileManager({tileProvider})
        this.initProgress(busy, renderingStatus$)
        this.initRenderingEnabled(renderingEnabled$)
    }

    initProgress(busy, renderingStatus$) {
        if (busy || renderingStatus$) {
            this.subscriptions.push(
                this.tileManager.getStatus$().subscribe(
                    ({tileProviderId, pending, pendingEnabled}) => {
                        busy?.set(`tileProvider-${tileProviderId}`, !!pendingEnabled)
                        renderingStatus$?.next({tileProviderId, pending})
                    }
                )
            )
        }
    }

    initRenderingEnabled(renderingEnabled$) {
        if (renderingEnabled$) {
            this.subscriptions.push(
                renderingEnabled$.subscribe(
                    enabled => this.tileManager.setEnabled(enabled)
                )
            )
        } else {
            this.tileManager.setEnabled(true)
        }
    }

    getType() {
        return this.tileProvider.getType()
    }

    getConcurrency() {
        return this.tileProvider.getConcurrency()
    }

    loadTile$(tileRequest) {
        return this.tileManager.loadTile$(tileRequest)
    }

    createElement(id, doc) {
        return this.tileProvider.createElement(id, doc)
    }

    renderTile({element, blob}) {
        this.tileProvider.renderTile({element, blob})
    }

    renderErrorTile({element, error}) {
        this.tileProvider.renderErrorTile({element, error})
    }

    releaseTile(element) {
        this.tileManager.releaseTile(element.id)
        this.tileProvider.releaseTile(element)
    }

    setVisibility(visible) {
        this.tileManager.setVisibility(visible)
    }

    close() {
        this.tileManager.close()
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
        this.tileProvider.close()
    }
}
