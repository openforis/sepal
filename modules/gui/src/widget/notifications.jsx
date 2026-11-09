import PropTypes from 'prop-types'
import React from 'react'
import {delay, filter, map, merge, mergeMap, scan, takeWhile, timer} from 'rxjs'

import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'

import {CopyButton} from './copyButton'
import {Layout} from './layout'
import {messageLines, messageTextLines} from './messageLines'
import {manuallyDismissed$, notify, published$} from './notificationPublisher'
import styles from './notifications.module.css'
import {setNotificationsContainer} from './notificationsContainer'
import {Scrollable} from './scrollable'

const PUBLISH_ANIMATION_DURATION_MS = 500
const DISMISS_ANIMATION_DURATION_MS = 500

const autoDismiss$ = published$.pipe(
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
    manuallyDismissed$,
    autoDismiss$.pipe(
        filter(({timeout}) => timeout === 0),
        map(({id}) => id)
    )
)

const added$ = published$.pipe(delay(PUBLISH_ANIMATION_DURATION_MS))
const removed$ = dismiss$.pipe(delay(DISMISS_ANIMATION_DURATION_MS))

class _Notifications extends React.Component {
    state = {
        notifications: {},
        timeouts: {}
    }

    renderHeader(notification) {
        const {title, level, error} = notification
        const copyable = level === 'error' || error
        return title || copyable
            ? (
                <Layout type='horizontal-nowrap'>
                    <div className={styles.title}>
                        {title}
                    </div>
                    {copyable ? this.renderCopyButton(notification) : null}
                </Layout>
            )
            : null
    }

    renderCopyButton(notification) {
        return (
            <CopyButton
                value={getCopyableText(notification)}
                air='none'
                chromeless
                icon='copy'
                shape='circle'
                tooltip={msg('button.copyToClipboard')}
                tooltipPlacement='top'
            />
        )
    }

    renderMessage(message) {
        return (
            <div className={styles.message}>
                {messageLines(message).map(this.renderMessageLine)}
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
        return (
            <div className={styles.error}>
                {getErrorMessage(error)}
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

    renderNotification(notification) {
        const {id, level, message, error, content, link, timeout, dismissable, adding, removing} = notification
        const dismiss = () => notify.dismiss(id)
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
                        {this.renderHeader(notification)}
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
            <div className={styles.container} ref={setNotificationsContainer}>
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

    // A notification published under an id already on screen replaces that one in place, mid-
    // animation included; a repeat of a grouped message is dropped, as before.
    withPublished(notifications, notification) {
        const shown = notifications[notification.id]
        if (shown) {
            return {...notifications, [notification.id]: {...notification, adding: shown.adding, removing: false}}
        }
        return this.isUniqueGroup(notifications, notification)
            ? {...notifications, [notification.id]: notification}
            : notifications
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            published$.subscribe(notification => {
                this.setState(({notifications}) => ({notifications: this.withPublished(notifications, notification)}))
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
            // Only a notification still on its way out goes: one re-published meanwhile stays.
            removed$.subscribe(id =>
                this.setState(({notifications}) => {
                    if (notifications[id]?.removing) {
                        delete notifications[id]
                    }
                    return {notifications}
                })
            )
        )
    }

}

const getErrorMessage = error =>
    typeof error === 'string' ? error : error.message

const getCopyableText = ({title, message, error}) =>
    [
        title,
        ...(message ? messageTextLines(message) : []),
        error ? getErrorMessage(error) : null
    ].filter(Boolean).join('\n')

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

Notifications.success = notify.success

Notifications.info = notify.info

Notifications.warning = notify.warning

Notifications.error = notify.error

Notifications.dismiss = notify.dismiss

Notifications.propTypes = {
    content: PropTypes.func,
    dismissable: PropTypes.any,
    error: PropTypes.string,
    group: PropTypes.oneOf([true, false, PropTypes.string]),
    id: PropTypes.string,
    level: PropTypes.string,
    link: PropTypes.string,
    message: PropTypes.node,
    timeout: PropTypes.number,
    title: PropTypes.string,
    onDismiss: PropTypes.func
}
