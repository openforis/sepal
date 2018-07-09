import _ from 'lodash'
import moment from 'moment'
import html from './notification.html'

const template = _.template(html({}), {interpolate: /{{(.+?)}}/g})

export default class NotificationView {
    constructor(notification) {
        const templateInput = {
            subject: notification.message.subject,
            contents: notification.message.contents.replace(/(?:\r\n|\r|\n)/g, '<br/>'),
            date: moment(notification.message.creationTime).fromNow(),
            className: notification.state === 'READ' ? 'read' : 'unread'

        }
        this.$element = template(templateInput)
    }
}
