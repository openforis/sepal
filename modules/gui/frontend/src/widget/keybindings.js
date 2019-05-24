import {fromEvent} from 'rxjs'
import _ from 'lodash'

const keybindings = []

const getCandidateKeybindings = key =>
    _.filter(keybindings,
        keybinding => !keybinding.disabled && keybinding.enabled && keybinding.handles(key)
    )

const getPriorityKeybinding = keybindings =>
    _.find(keybindings, keybinding => keybinding.priority)
    
const getDefaultKeybinding = keybindings =>
    _.first(keybindings)

const getKeybinding = keybindings =>
    getPriorityKeybinding(keybindings) || getDefaultKeybinding(keybindings)

const getHandler = key => {
    const candidateKeybindings = getCandidateKeybindings(key)
    const keybinding = getKeybinding(candidateKeybindings)
    return keybinding && keybinding.handler
}
    
const handleEvent = event => {
    const key = [
        {key: 'Ctrl', value: event.ctrlKey},
        {key: 'Alt', value: event.altKey},
        {key: 'Shift', value: event.shiftKey},
        {key: 'Meta', value: event.metaKey}]
        .filter(({value}) => value)
        .map(({key}) => key)
        .concat([event.key])
        .join('+')
    const handler = getHandler(key)
    if (handler) {
        handler(event, key)
    }
}

fromEvent(document, 'keydown')
    .subscribe(
        event => handleEvent(event)
    )

export const add = keybinding =>
    keybindings.unshift(keybinding)

export const remove = keybinding =>
    _.pull(keybindings, keybinding)
