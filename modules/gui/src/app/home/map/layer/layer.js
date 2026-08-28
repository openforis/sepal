import {ReplaySubject, takeUntil} from 'rxjs'

import {getLogger} from '~/log'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Notifications} from '~/widget/notifications'

const log = getLogger('layer')

export class Layer {
    cancel$ = new ReplaySubject(1)

    addToMap$ = () => {
        throw new Error('Layer.addToMap$ needs to be implemented by subclass')
    }

    removeFromMap = () => {
        throw new Error('Layer.removeFromMap needs to be implemented by subclass')
    }

    setVisibility = () => undefined

    // Every layer can absorb an index, so SepalMap.setLayer can hand one to a layer it keeps without
    // asking what kind it is. Only layers stored in googleMap.overlayMapTypes act on it.
    setLayerIndex = layerIndex => {
        this.layerIndex = layerIndex
    }

    add = () => {
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
                    error: toUserErrorMessage(error),
                    group: true,
                    timeout: 0
                })
            }
        })
    }

    remove = () => {
        log.debug('Remove layer')
        this.cancel$.next()
        this.removeFromMap()
    }
}
