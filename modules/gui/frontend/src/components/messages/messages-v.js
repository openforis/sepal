var MessageView = require('./message-v')
require('./messages.scss')

var $html = null

var init = function () {
    var template = require('./messages.html')
    $html = $(template({}))

    var appSection = $('#app-section').find('.messages')
    if (appSection.children().length <= 0) {
        appSection.append($html)
        MessageView($html, null, onSave)
    }
}
var onSave = function (view) {
    $html
        .find('.messages')
        .prepend(view.clone().$element)
    view.reset()
}

var setMessages = function (messages) {
    var $messages = $html.find('.messages')
    if (messages.length)
        $messages.html('')
    messages
        .forEach(function (message) {
            $messages.append(MessageView(null, message).$element)
        })
}

module.exports = {
    init: init,
    setMessages: setMessages
}