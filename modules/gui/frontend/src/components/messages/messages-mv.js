const EventBus = require('../event/event-bus')
const Events = require('../event/events')
const View = require('./messages-v')

const show = (e, type) => {
    if (type === 'messages') {
        loadMessages()
        View.init()
    }
}

const loadMessages = () => {
    const params = {
        url: '/notification/messages',
        success: function (messages) {
            View.setMessages(messages)
        }
    }
    EventBus.dispatch(Events.AJAX.GET, null, params)
}

EventBus.addEventListener(Events.SECTION.SHOW, show)
