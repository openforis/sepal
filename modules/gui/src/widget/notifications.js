import {Subject, delay, filter, map, merge, mergeMap, scan, takeWhile, timer} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import {publishError} from 'eventPublisher'
import {v4 as uuid} from 'uuid'
import {withSubscriptions} from 'subscription'
import PropTypes from 'prop-types'
import React from 'react'
import hash from 'object-hash'
import styles from './notifications.module.css'

const PUBLISH_ANIMATION_DURATION_MS = 250
const DISMISS_ANIMATION_DURATION_MS = 250

const publish$ = new Subject()
const manualDismiss$ = new Subject()

const autoDismiss$ = publish$
    .pipe(
        filter(({timeout}) => timeout),
        mergeMap(({id, timeout}) =>
            timer(0, 1000).pipe(
                scan(timeout => timeout - 1, timeout + 1),
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

const remove$ = dismiss$.pipe(delay(DISMISS_ANIMATION_DURATION_MS))

const group = ({group = false, id, ...notification}) =>
    group === false
        ? id
        : group === true
            ? hash(notification) // id is excluded
            : group

const publish = notification => {
    const publish = notification =>
        publish$.next({
            ...notification,
            group: group(notification)
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
    }) => ({id, level, title, timeout, dismissable, ...notification})

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
                {message}
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

    renderNotification({id, level, title, message, error, content, timeout, dismissable, dismissing}) {
        const dismiss = () => manualDismiss$.next(id)
        return id
            ? (
                <div
                    key={id}
                    className={[
                        styles.notification,
                        styles[level],
                        dismissable ? styles.dismissable : null,
                        dismissing ? styles.dismissing : null
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
                    {this.renderDismissMessage(id)}
                    {this.renderAutoDismissIndicator(timeout)}
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
                {this.renderNotifications()}
            </div>
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            publish$.subscribe(notification => {
                this.setState(({notifications}) => {
                    if (!Object.values(notifications).find(({group}) => group === notification.group)) {
                        return {
                            notifications: {
                                ...notifications,
                                [notification.id]: notification
                            }
                        }
                    }
                })
            }
            ),
            dismiss$.subscribe(id => {
                this.setState(({notifications, timeouts}) => {
                    delete timeouts[id]
                    const notification = notifications[id]
                    if (notification) {
                        notification.dismissing = true
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
            remove$.subscribe(id =>
                this.setState(({notifications}) => {
                    delete notifications[id]
                    return {notifications}
                })
            )
        )
    }
}

const Notifications = compose(
    _Notifications,
    withSubscriptions()
    // connect(mapStateToProps)
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

export default Notifications

Notifications.propTypes = {
    content: PropTypes.func,
    dismissable: PropTypes.any,
    error: PropTypes.string,
    group: PropTypes.oneOf([true, false, PropTypes.string]),
    id: PropTypes.string,
    level: PropTypes.string,
    message: PropTypes.string,
    timeout: PropTypes.number,
    title: PropTypes.string,
}
