import {Subject, merge, timer} from 'rxjs'
import {connect, select} from 'store'
import {delay, filter, map, mergeMap} from 'rxjs/operators'
import {simplehash as hash} from 'hash'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from './notifications.module.css'
import withSubscriptions from 'subscription'

const PATH = 'Notifications'
const DISMISS_DELAY_MS = 500

const publish$ = new Subject()
const manualDismiss$ = new Subject()
const autoDismiss$ = publish$
    .pipe(
        filter(notification => notification.timeout),
        mergeMap(notification =>
            timer(notification.timeout).pipe(
                map(() => notification.id)
            )
        )
    )
const dismiss$ = merge(manualDismiss$, autoDismiss$)
const remove$ = dismiss$.pipe(delay(DISMISS_DELAY_MS))

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
        timeout = 3000,
        dismissable = true,
        ...notification
    }) => ({id, level, title, timeout, dismissable, ...notification})

    publish(applyDefaults(notification))
}
const dismiss = notificationId =>
    manualDismiss$.next(notificationId)

const mapStateToProps = () => ({
    notifications: select(PATH) || []
})

class _Notifications extends React.Component {
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

    renderDismissMessage() {
        return (
            <div className={styles.dismiss}>
                {msg('widget.notification.dismiss')}
            </div>
        )
    }

    renderNotification({id, level, title, message, error, content, timeout, dismissable, dismissing}) {
        const dismiss = () => manualDismiss$.next(id)
        return (
            <div
                key={id}
                className={[
                    styles.notification,
                    styles[level],
                    dismissable ? styles.dismissable : null,
                    dismissing ? styles.dismissing : null
                ].join(' ')}
                style={{'--dismiss-time-ms': `${DISMISS_DELAY_MS}ms`}}
                onClick={() => dismissable && dismiss()}
            >
                {title ? this.renderTitle(title) : null}
                {message ? this.renderMessage(message) : null}
                {error ? this.renderError(error) : null}
                {content ? this.renderContent(content, dismiss) : null}
                {timeout === 0 ? this.renderDismissMessage() : null}
            </div>
        )
    }

    renderNotifications() {
        const {notifications} = this.props
        return notifications.map(notification => this.renderNotification(notification))
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
            publish$.subscribe(notification =>
                actionBuilder('PUBLISH_NOTIFICATION')
                    .pushUnique(PATH, notification, 'group')
                    .dispatch()
            ),
            dismiss$.subscribe(notificationId =>
                actionBuilder('DISMISS_NOTIFICATION')
                    .assign([PATH, {id: notificationId}], {dismissing: true})
                    .dispatch()
            ),
            remove$.subscribe(notificationId =>
                actionBuilder('REMOVE_NOTIFICATION')
                    .del([PATH, {id: notificationId}])
                    .dispatch()
            )
        )
    }
}

const Notifications = (
    connect(mapStateToProps)(
        withSubscriptions(
            _Notifications
        )
    )
)

Notifications.success = notification =>
    publish({...notification, level: 'success'})

Notifications.info = notification =>
    publish({...notification, level: 'info'})

Notifications.warning = notification =>
    publish({...notification, level: 'warning'})

Notifications.error = notification =>
    publish({...notification, level: 'error'})

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
