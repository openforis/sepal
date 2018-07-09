import MessageView from './message-v'
import './messages.scss'

let $html = null

export const init = () => {
    const template = require('./messages.html')
    $html = $(template({}))

    const appSection = $('#app-section').find('.messages')
    if (appSection.children().length <= 0) {
        appSection.append($html)
        new MessageView({
            $element: $html,
            onSave
        })
    }
}
const onSave = (view) => {
    $html
        .find('.messages')
        .prepend(view.clone().$element)
    view.reset()
}

export const setMessages = (messages) => {
    const $messages = $html.find('.messages')
    if (messages.length)
        $messages.html('')
    messages
        .map(message => new MessageView({message}))
        .map(view => $messages.append(view.$element))
}
