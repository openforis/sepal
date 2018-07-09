import NotificationView from './notification-v'
import './notifications.scss'

let $html = null

export const init = () => {
    const template = require('./notifications.html')
    $html = $(template({}))

    const appSection = $('#app-section').find('.notifications')
    if (appSection.children().length <= 0)
        appSection.append($html)
}

export const setNotifications = (notifications = []) => {
    const $notifications = $html.find('.notifications')
    if (notifications.length)
        $notifications.html('')
    notifications
        .forEach(notification => $notifications.append(new NotificationView(notification).$element))
}