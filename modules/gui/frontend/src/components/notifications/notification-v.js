var _ = require('lodash')
var moment = require('moment')
var html = require('./notification.html')

var template = _.template(html({}), {interpolate: /{{(.+?)}}/g})

var NotificationView = function (notification) {
    var templateInput = {
        subject: notification.message.subject,
        contents: notification.message.contents.replace(/(?:\r\n|\r|\n)/g, '<br/>'),
        date: moment(notification.message.creationTime).fromNow(),
        className: notification.state === 'READ' ? 'read' : 'unread'

    }
    return {
        $element: template(templateInput)
    }
}

module.exports = NotificationView