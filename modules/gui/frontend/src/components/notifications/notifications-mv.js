var _ = require('lodash')
var View = require('./notifications-v')

var EventBus = require('../event/event-bus')
var Events = require('../event/events')

var jobTimer = null
var _notifications = []

var init = function () {
    View.init()
    startJob()
}

var stopJob = function () {
    if (jobTimer) {
        clearTimeout(jobTimer)
        jobTimer = null
    }
}

var startJob = function () {
    if (!jobTimer) {
        var executeTaskRequest = function () {
            jobTimer = setTimeout(function () {
                loadNotifications(executeTaskRequest)
            }, 60 * 1000)
        }
        loadNotifications(executeTaskRequest)
    }
}

var show = function (e, type) {
    if (type === 'notifications') {
        View.setNotifications(_notifications)
        var markedAnyAsRead = _notifications
            .filter(function (notification) {
                return notification.state === 'UNREAD'
            })
            .map(function (notification) {
                notification.state = 'READ'
                var params = {
                    url: '/notification/notifications/' + notification.message.id,
                    data: {state: 'READ'}
                }
                EventBus.dispatch(Events.AJAX.POST, null, params)
            })
            .length

        if (markedAnyAsRead)
            EventBus.dispatch(Events.NOTIFICATION.NOTIFICATIONS_UPDATED, null, _notifications)
    }
}

var loadNotifications = function (callback) {
    var params = {
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
