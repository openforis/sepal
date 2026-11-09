import _ from 'lodash'
import hash from 'object-hash'
import {Subject} from 'rxjs'

import {publishError} from '~/eventPublisher'
import {msg} from '~/translate'
import {uuid} from '~/uuid'

// Publishing notifications, apart from the view that shows them (notifications.jsx, whose `Notifications` API is this
// one): a module that only publishes - clipboard.js among them - depends on neither the view nor the controls it renders
// with. Every notification and every manual dismissal passes through these two subjects; nothing is replayed.
const publish$ = new Subject()
const manualDismiss$ = new Subject()

export const published$ = publish$.asObservable()

export const manuallyDismissed$ = manualDismiss$.asObservable()

export const notify = {
    success: notification =>
        publish({...notification, level: 'success'}),
    info: notification =>
        publish({...notification, level: 'info'}),
    warning: notification =>
        publish({...notification, level: 'warning'}),
    error: notification => {
        publish({...notification, level: 'error'})
        publishError(typeof notification === 'string'
            ? notification
            : (notification.message || notification)
        )
    },
    dismiss: notificationId =>
        manualDismiss$.next(notificationId)
}

const publish = notification => {
    const publish = notification =>
        publish$.next({
            ...notification,
            group: getGroup(notification)
        })

    const defaultTitle = {
        'error': msg('widget.notification.error.title'),
        'warning': msg('widget.notification.warning.title')
    }

    const applyDefaults = ({
        id = uuid(),
        level = 'info',
        title = defaultTitle[level],
        timeout = 8,
        dismissable = true,
        ...notification
    }) => ({id, level, title, timeout, dismissable, ...notification, adding: true})

    publish(applyDefaults(notification))
}

const getGroup = ({group = false, id, ...notification}) =>
    group === false
        ? id
        : group === true
            ? hash(_.omit(notification, ['id', 'error'])) // id and error are excluded
            : group
