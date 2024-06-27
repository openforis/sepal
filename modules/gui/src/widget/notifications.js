import _ from 'lodash'
import hash from 'object-hash'
import PropTypes from 'prop-types'
import React from 'react'
import {delay, filter, map, merge, mergeMap, scan, Subject, takeWhile, timer} from 'rxjs'

import {compose} from '~/compose'
import {publishError} from '~/eventPublisher'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {uuid} from '~/uuid'

import styles from './notifications.module.css'
import {Scrollable} from './scrollable'

const PUBLISH_ANIMATION_DURATION_MS = 1000
const DISMISS_ANIMATION_DURATION_MS = 1000

const publish$ = new Subject()
const manualDismiss$ = new Subject()

const autoDismiss$ = publish$.pipe(
    filter(({timeout}) => timeout),
    mergeMap(({id, timeout}) =>
        timer(0, 1000).pipe(
            scan(timeout => timeout - 1, Math.round(timeout) + 1),
            takeWhile(timeout => timeout >= 0),
            map(timeout => ({id, timeout}))
        )
    )
)

const dismiss$ = merge(
    manualDismiss$,
    autoDismiss$.pipe(
        filter(({timeout}) => timeout === 0),
        map(({id}) => id)
    )
)

const added$ = publish$.pipe(delay(PUBLISH_ANIMATION_DURATION_MS))
const removed$ = dismiss$.pipe(delay(DISMISS_ANIMATION_DURATION_MS))

const getGroup = ({group = false, id, ...notification}) =>
    group === false
        ? id
        : group === true
            ? hash(_.omit(notification, ['id', 'error'])) // id and error are excluded
            : group

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

const dismiss = notificationId =>
    manualDismiss$.next(notificationId)

class _Notifications extends React.Component {
    state = {
        notifications: {},
        timeouts: {}
    }

    renderTitle(title) {
        return (
            <div className={styles.title}>
                {title}
            </div>
        )
    }

    renderMessage(message) {
        return (
            <div className={styles.message}>
                {message.split('|').map(this.renderMessageLine)}
            </div>
        )
    }

    renderMessageLine(messageLine, index) {
        return (
            <div key={index} className={styles.messageLine}>
                {messageLine}
            </div>
        )
    }
    
    renderError(error) {
        const errorMessage = typeof error === 'string' ? error : error.message
        return (
            <div className={styles.error}>
                {errorMessage}
            </div>
        )
    }

    renderContent(content, dismiss) {
        return (
            <div className={styles.content}>
                {content(dismiss)}
            </div>
        )
    }

    renderLink(link) {
        return (
            <div className={styles.link}>
                <a href={link} target="_blank" rel="noreferrer">{link}</a>
            </div>
        )
    }

    renderDismissMessage(id) {
        const {timeouts} = this.state
        const timeout = timeouts[id] || 0
        const message = timeout
            ? msg('widget.notification.dismissOrWait', {timeout})
            : msg('widget.notification.dismiss')
        return (
            <div className={styles.dismiss}>
                {message}
            </div>
        )
    }

    renderAutoDismissIndicator(timeout) {
        return timeout
            ? (
                <div className={styles.autoDismiss} style={{'--auto-dismiss-timeout-s': `${timeout}s`}}/>
            )
            : null
    }

    renderNotification({id, level, title, message, error, content, link, timeout, dismissable, adding, removing}) {
        const dismiss = () => manualDismiss$.next(id)
        return id
            ? (
                <div
                    key={id}
                    className={styles.wrapper}
                >
                    <div
                        className={[
                            styles.notification,
                            styles[level],
                            dismissable ? styles.dismissable : null,
                            adding ? styles.adding : null,
                            removing ? styles.removing : null
                        ].join(' ')}
                        style={{
                            '--publish-animation-duration-ms': `${PUBLISH_ANIMATION_DURATION_MS}ms`,
                            '--dismiss-animation-duration-ms': `${DISMISS_ANIMATION_DURATION_MS}ms`
                        }}
                        onClick={() => dismissable && dismiss()}
                    >
                        {title ? this.renderTitle(title) : null}
                        {message ? this.renderMessage(message) : null}
                        {error ? this.renderError(error) : null}
                        {content ? this.renderContent(content, dismiss) : null}
                        {link ? this.renderLink(link) : null}
                        {timeout > 3 ? this.renderDismissMessage(id) : null}
                        {this.renderAutoDismissIndicator(timeout)}
                    </div>
                </div>
            )
            : null
    }

    renderNotifications() {
        const {notifications} = this.state
        return Object.values(notifications).map(notification => this.renderNotification(notification))
    }

    render() {
        return (
            <div className={styles.container}>
                <Scrollable
                    direction='y'
                    className={styles.scrollable}
                    hideScrollbar>
                    {this.renderNotifications()}
                </Scrollable>
            </div>
        )
    }

    isUniqueGroup(notifications, notification) {
        const noGroup = !notification.group
        const uniqueGroup = !Object.values(notifications).find(({group}) => group === notification.group)
        return noGroup || uniqueGroup
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            publish$.subscribe(notification => {
                this.setState(({notifications}) => {
                    if (this.isUniqueGroup(notifications, notification)) {
                        return {
                            notifications: {
                                ...notifications,
                                [notification.id]: notification
                            }
                        }
                    }
                })
            }),
            dismiss$.subscribe(id => {
                this.setState(({notifications, timeouts}) => {
                    delete timeouts[id]
                    const notification = notifications[id]
                    if (notification) {
                        const onDismiss = notification.onDismiss
                        onDismiss && onDismiss()
                        notification.removing = true
                    }
                    return {notifications, timeouts}
                })
            }),
            autoDismiss$.subscribe(({id, timeout}) => {
                this.setState(({timeouts}) => {
                    if (timeout > 0) {
                        timeouts[id] = timeout
                    } else {
                        delete timeouts[id]
                    }
                    return {timeouts}
                })
            }),
            added$.subscribe(({id}) => {
                this.setState(({notifications}) => {
                    const notification = notifications[id]
                    if (notification) {
                        delete notification.adding
                    }
                    return {notifications}
                })
            }),
            removed$.subscribe(id =>
                this.setState(({notifications}) => {
                    delete notifications[id]
                    return {notifications}
                })
            )
        )
    }

}

// const publishRandomNotification = () => {
//     const levels = ['info', 'success', 'warning', 'error']
//     const level = levels[Math.floor(Math.random() * levels.length)]
//     publish({
//         level,
//         message: 'Hello there',
//         timeout: 0,
//         onDismiss: createRandomNotification
//     })
// }

export const Notifications = compose(
    _Notifications,
    withSubscriptions()
)

Notifications.success = notification =>
    publish({...notification, level: 'success'})

Notifications.info = notification =>
    publish({...notification, level: 'info'})

Notifications.warning = notification =>
    publish({...notification, level: 'warning'})

Notifications.error = notification => {
    publish({...notification, level: 'error'})
    publishError(typeof notification === 'string'
        ? notification
        : (notification.message || notification)
    )
}

Notifications.dismiss = notificationId =>
    dismiss(notificationId)

Notifications.propTypes = {
    content: PropTypes.func,
    dismissable: PropTypes.any,
    error: PropTypes.string,
    group: PropTypes.oneOf([true, false, PropTypes.string]),
    id: PropTypes.string,
    level: PropTypes.string,
    link: PropTypes.string,
    message: PropTypes.string,
    timeout: PropTypes.number,
    title: PropTypes.string,
    onDismiss: PropTypes.func
}
