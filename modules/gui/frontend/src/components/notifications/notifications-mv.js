import _ from 'lodash'
import * as EventBus from '../event/event-bus'
import * as Events from '../event/events'
import * as View from './notifications-v'

let jobTimer = null
let _notifications = []

const init = () => {
    View.init()
    startJob()
}

const stopJob = () => {
    if (jobTimer) {
        clearTimeout(jobTimer)
        jobTimer = null
    }
}

const startJob = () => {
    if (!jobTimer) {
        const executeTaskRequest = () => {
            jobTimer = setTimeout(function () {
                loadNotifications(executeTaskRequest)
            }, 60 * 1000)
        }
        loadNotifications(executeTaskRequest)
    }
}

const show = (e, type) => {
    if (type === 'notifications') {
        View.setNotifications(_notifications)
        const markedAnyAsRead = _notifications
            .filter(notification => notification.state === 'UNREAD')
            .map(notification => {
                notification.state = 'READ'
                const params = {
                    url: `/notification/notifications/${notification.message.id}`,
                    data: {state: 'READ'}
                }
                EventBus.dispatch(Events.AJAX.POST, null, params)
            })
            .length

        if (markedAnyAsRead)
            EventBus.dispatch(Events.NOTIFICATION.NOTIFICATIONS_UPDATED, null, _notifications)
    }
}

const loadNotifications = (callback) => {
    const params = {
        url: '/notification/notifications',
        success: function (notifications) {
            if (!_.isEqual(_notifications, notifications))
                EventBus.dispatch(Events.NOTIFICATION.NOTIFICATIONS_UPDATED, null, notifications)
            _notifications = notifications
            callback && callback()
        }
    }
    EventBus.dispatch(Events.AJAX.GET, null, params)
}

EventBus.addEventListener(Events.APP.LOAD, init)
EventBus.addEventListener(Events.SECTION.SHOW, show)
EventBus.addEventListener(Events.APP.DESTROY, stopJob)
