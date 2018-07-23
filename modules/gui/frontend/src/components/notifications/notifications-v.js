var NotificationView = require('./notification-v')
require('./notifications.scss')

var $html = null

var init = function () {
    var template = require('./notifications.html')
    $html = $(template({}))

    var appSection = $('#app-section').find('.notifications')
    if (appSection.children().length <= 0)
        appSection.append($html)
}

var setNotifications = function (notifications) {
    notifications = notifications || []
    var $notifications = $html.find('.notifications')
    if (notifications.length)
        $notifications.html('')
    notifications
        .forEach(function (notification) {
            return $notifications.append(new NotificationView(notification).$element)
        })
}

module.exports = {
    init: init,
    setNotifications: setNotifications
}