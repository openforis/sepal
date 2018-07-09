var EventBus = require('../event/event-bus')
var Events = require('../event/events')
var guid = require('../guid/guid')
var Loader = require('../loader/loader')
var messageTemplate = require('./message.html')

var MessageView = function ($element, message, onSave) {
    message = message || {id: guid.random()}
    $element = $element || $(messageTemplate({}))
    var $delete = $element.find('.btn-delete')
    var $submit = $element.find('.btn-submit')
    var $reset = $element.find('.btn-reset')
    var $subject = $element.find('input[name=subject]')
    var $contents = $element.find('textarea[name=contents]')

    $delete.click(function (e) {
        e.preventDefault()
        remove()
    })
    $submit.click(function (e) {
        e.preventDefault()
        save()
    })
    $reset.click(function (e) {
        e.preventDefault()
        reset(message)
        $subject.focus()
    })

    var remove = function () {
        var params = {
            url: '/notification/messages/' + message.id,
            beforeSend: function () {
                Loader.show()
            },
            success: function () {
                Loader.hide({delay: 200})
                $element.remove()
            }
        }
        EventBus.dispatch(Events.AJAX.DELETE, null, params)
    }

    var reset = function (messageToResetTo) {
        message = messageToResetTo || {id: guid.random()}
        $subject.val(message.subject)
        $contents.val(message.contents)
    }

    var save = function () {
        message = {
            id: message.id,
            subject: $subject.val(),
            contents: $contents.val(),
            type: 'SYSTEM'
        }
        var params = {
            url: '/notification/messages/' + message.id,
            data: message,
            beforeSend: function () {
                Loader.show()
            },
            success: function () {
                Loader.hide({delay: 200})
                onSave && onSave(returnObject())
            }
        }
        EventBus.dispatch(Events.AJAX.POST, null, params)
    }

    var clone = function () {
        var clonedMessage = {
            id: message.id,
            subject: $subject.val(),
            contents: $contents.val()
        }
        return MessageView(null, clonedMessage, null)
    }

    var returnObject = function () {
        return {
            $element: $element,
            clone: clone,
            reset: reset
        }
    }

    reset(message)
    return returnObject()
}

module.exports = MessageView