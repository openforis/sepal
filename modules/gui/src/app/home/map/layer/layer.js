import {ReplaySubject, of, takeUntil} from 'rxjs'
import {getLogger} from 'log'
import {msg} from 'translate'
import Notifications from 'widget/notifications'

const log = getLogger('layer')

export default class Layer {
    constructor({map}) {
        this.map = map
        this.cancel$ = new ReplaySubject()
        this.initialized = false
    }

    equals(_other) {
        throw new Error('Subclass should implement equals')
    }

    addToMap() {
        log.debug('Add to map')
    }

    removeFromMap() {
        log.debug('Remove from map')
        this.cancel$.next()
    }

    // TODO: is this needed at all?
    hide(_hidden) {
        // no-op
    }

    initialize$() {
        return of(true)
    }

    initialize() {
        log.debug('Initialize')
        this.initialize$().pipe(
            takeUntil(this.cancel$)
        ).subscribe({
            next: () => {
                this.initialized = true
                this.addToMap()
            },
            error: error => {
                log.warn('Initialization failed', error)
                Notifications.error({
                    message: msg('map.layer.error'),
                    error,
                    group: true,
                    timeout: 0
                })
            },
            complete: () => {
                log.debug('Initialization complete')
            }
        })
    }

    isInitialized() {
        return this.initialized
    }
}
