import {ReplaySubject, takeUntil} from 'rxjs'
import {getLogger} from 'log'
import {msg} from 'translate'
import Notifications from 'widget/notifications'

const log = getLogger('layer')

export class Layer {
    layer = null
    cancel$ = new ReplaySubject(1)

    addToMap$ = () => {
        throw new Error('Layer.addToMap$ needs to be implemented by subclass')
    }

    removeFromMap = () => {
        throw new Error('Layer.removeFromMap needs to be implemented by subclass')
    }
    
    add() {
        log.debug('Add layer')
        this.addToMap$().pipe(
            takeUntil(this.cancel$)
        ).subscribe({
            next: () => {
                log.debug('Layer added')
            },
            error: error => {
                log.warn('Cannot add layer', error)
                Notifications.error({
                    message: msg('map.layer.error'),
                    error,
                    group: true,
                    timeout: 0
                })
            }
        })
    }

    remove = () => {
        log.debug('Remove layer')
        this.cancel$.next()
        if (this.layer) {
            this.removeFromMap()
            this.layer = null
        }
    }
}
