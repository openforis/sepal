var EventBus = require('../event/event-bus')
var Events = require('../event/events')
var guid = require('../guid/guid')
var Loader = require('../loader/loader')
var messageTemplate = require('./message.html')
var Editor = require('@ckeditor/ckeditor5-build-classic/build/ckeditor')

var MessageView = function ($element, message, onSave) {
    message = message || {id: guid.random()}
    $element = $element || $(messageTemplate({}))
    var $delete = $element.find('.btn-delete')
    var $submit = $element.find('.btn-submit')
    var $reset = $element.find('.btn-reset')
    var $subject = $element.find('input[name=subject]')
    var editor = null

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
        message = messageToResetTo || {id: guid.random(), contents: ''}
        $subject.val(message.subject)
        editor && editor.setData(message.contents || '')
    }

    var save = function () {
        message = {
            id: message.id,
            subject: $subject.val(),
            contents: editor.getData(),
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
            contents: editor.getData()
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

    var createEditor = function () {
        $element.find('textarea').get().forEach(function (textArea) {
            Editor.create(textArea, {
                toolbar: ['bold', 'italic', 'link', 'bulletedList', 'numberedList', 'blockQuote']
            }).then(function (_editor) {
                editor = _editor
                editor.setData(message.contents || '')
            })
        })
    }

    reset(message)
    editor = createEditor()
    return returnObject()
}

module.exports = MessageView