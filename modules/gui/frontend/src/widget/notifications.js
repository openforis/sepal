import {Subject, merge, timer} from 'rxjs'
import {connect, select} from 'store'
import {delay, filter, map, mergeMap} from 'rxjs/operators'
import {v4 as uuid} from 'uuid'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './notifications.module.css'

const PATH = 'sepalNotifications'
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

class SepalNotifications extends React.Component {
    subscriptions = []

    renderTitle(title) {
        return (
            <div className={styles.title}>
                {title}
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

    renderMessage(message) {
        return (
            <div className={styles.message}>
                {message}
            </div>
        )
    }

    renderNotification({id, level, title, message, content, dismissable, dismissing}) {
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
                    .unshift(PATH, notification)
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

const ConnectedSepalNotifications = connect(mapStateToProps)(SepalNotifications)

ConnectedSepalNotifications.publish = notification => {
    const notificationId = uuid()
    publish$.next(_.defaults(notification, {
        id: notificationId,
        level: 'info',
        timeout: 3000
    }))
}

ConnectedSepalNotifications.success = notification =>
    ConnectedSepalNotifications.publish({...notification, level: 'success'})

ConnectedSepalNotifications.info = notification =>
    ConnectedSepalNotifications.publish({...notification, level: 'info'})

ConnectedSepalNotifications.warning = notification =>
    ConnectedSepalNotifications.publish({...notification, level: 'warning', title: 'Warning'})

ConnectedSepalNotifications.error = notification =>
    ConnectedSepalNotifications.publish({...notification, level: 'error', title: 'Error'})

ConnectedSepalNotifications.caught = notification =>
    ConnectedSepalNotifications.publish({...notification, level: 'error'})

ConnectedSepalNotifications.dismiss = notificationId =>
    manualDismiss$.next(notificationId)

export default ConnectedSepalNotifications
