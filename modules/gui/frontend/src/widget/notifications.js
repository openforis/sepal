import {Subject, merge, timer} from 'rxjs'
import {connect, select} from 'store'
import {delay, filter, map, mergeMap} from 'rxjs/operators'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from './notifications.module.css'

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

const mapStateToProps = () => ({
    notifications: select(PATH) || []
})

class Notifications extends React.Component {
    subscriptions = []

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
        return (
            <div className={styles.error}>
                {error}
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

    renderNotification({id, level, title, message, error, content, dismissable, dismissing}) {
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
        this.subscriptions.push(
            publish$.subscribe(notification =>
                actionBuilder('PUBLISH_NOTIFICATION')
                    .push(PATH, notification)
                    .dispatch()
            )
        )
        this.subscriptions.push(
            dismiss$.subscribe(notificationId =>
                actionBuilder('DISMISS_NOTIFICATION')
                    .assignValueByTemplate(PATH, {id: notificationId}, {dismissing: true})
                    .dispatch()
            )
        )
        this.subscriptions.push(
            remove$.subscribe(notificationId =>
                actionBuilder('REMOVE_NOTIFICATION')
                    .delValueByTemplate(PATH, {id: notificationId})
                    .dispatch()
            )
        )
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

const ConnectedNotifications = connect(mapStateToProps)(Notifications)

ConnectedNotifications.publish = notification => {
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

    publish$.next(applyDefaults(notification))
}

ConnectedNotifications.success = notification =>
    ConnectedNotifications.publish({...notification, level: 'success'})

ConnectedNotifications.info = notification =>
    ConnectedNotifications.publish({...notification, level: 'info'})

ConnectedNotifications.warning = notification =>
    ConnectedNotifications.publish({...notification, level: 'warning'})

ConnectedNotifications.error = notification =>
    ConnectedNotifications.publish({...notification, level: 'error'})

ConnectedNotifications.dismiss = notificationId =>
    manualDismiss$.next(notificationId)

export default ConnectedNotifications
