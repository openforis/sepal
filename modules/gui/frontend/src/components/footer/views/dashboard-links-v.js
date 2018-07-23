/**
 * @author Mino Togna
 */
var EventBus = require('../../event/event-bus')
var Events = require('../../event/events')
var UserMV = require('../../user/user-mv')
var TasksM = require('../../tasks/tasks-m')

var $container = null
var $btnTasks = null
var $btnUsers = null
var $btnMessages = null
var $btnNotifications = null

var init = function (container) {
    $container = $(container)
    $btnTasks = $container.find('.btn-tasks')
    $btnNotifications = $container.find('.btn-notifications')
    $btnMessages = $container.find('.btn-messages')
    $btnUsers = $container.find('.btn-users')

    $btnTasks.click(function (e) {
        e.preventDefault()

        EventBus.dispatch(Events.SECTION.NAV_MENU.COLLAPSE)
        EventBus.dispatch(Events.SECTION.SHOW, null, 'tasks')
    })

    $btnNotifications.click(function (e) {
        e.preventDefault()

        EventBus.dispatch(Events.SECTION.NAV_MENU.COLLAPSE)
        EventBus.dispatch(Events.SECTION.SHOW, null, 'notifications')
    })

    if (UserMV.getCurrentUser().isAdmin()) {
        $btnMessages.click(function (e) {
            e.preventDefault()

            EventBus.dispatch(Events.SECTION.NAV_MENU.COLLAPSE)
            EventBus.dispatch(Events.SECTION.SHOW, null, 'messages')
        })

        $btnUsers.click(function (e) {
            e.preventDefault()

            EventBus.dispatch(Events.SECTION.NAV_MENU.COLLAPSE)
            EventBus.dispatch(Events.SECTION.SHOW, null, 'users')
        })
    } else {
        $btnMessages.remove()
        $btnUsers.remove()
    }
}

var updateTasks = function () {
    var activeCount = TasksM.activeCount()
    if (activeCount > 0) {
        $btnTasks.html('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>')
    } else {
        $btnTasks.html('<i class="fa fa-tasks" aria-hidden="true"></i>')
    }
}

var updateNotifications = function (e, notifications) {
    const allRead = notifications.filter(function (notification) {
        return notification.state === 'UNREAD'
    }).length === 0
    $btnNotifications.removeClass('unread')
    if (!allRead)
        $btnNotifications.addClass('unread')
}


module.exports = {
    init: init
    , updateTasks: updateTasks
    , updateNotifications: updateNotifications
}