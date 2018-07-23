var EventBus = require('../event/event-bus')
var Events = require('../event/events')
var View = require('./messages-v')

var show = function (e, type) {
    if (type === 'messages') {
        loadMessages()
        View.init()
    }
}

var loadMessages = function () {
    var params = {
        url: '/notification/messages',
        success: function (messages) {
            View.setMessages(messages)
        }
    }
    EventBus.dispatch(Events.AJAX.GET, null, params)
}

EventBus.addEventListener(Events.SECTION.SHOW, show)
