import {actionBuilder} from '~/action-builder'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'

const nextSelectedTabId = (id, statePath) => {
    const tabs = select([statePath, 'tabs'])
    const tabIndex = tabs.findIndex(tab => tab.id === id)
    const first = tabIndex === 0
    const last = tabIndex === tabs.length - 1
    if (!last) {
        return tabs[tabIndex + 1].id
    }
    if (!first) {
        return tabs[tabIndex - 1].id
    }
    return null
}

export const addTab = (statePath, type, placeholder = msg('widget.tabs.newTab')) => {
    const id = uuid()
    const tab = {id, type, placeholder, title: ''}
    actionBuilder('ADD_TAB')
        .push([statePath, 'tabs'], tab)
        .set([statePath, 'selectedTabId'], id)
        .dispatch()
    return tab
}

export const closeTab = (id, statePath, nextId) => {
    actionBuilder('CLOSING_TAB')
        .set([statePath, 'tabs', {id}, 'ui.closing'], true)
        .dispatch()
    setImmediate(() =>
        actionBuilder('CLOSE_TAB')
            .set([statePath, 'selectedTabId'], nextId || nextSelectedTabId(id, statePath))
            .del([statePath, 'tabs', {id}])
            .dispatch()
    )
}

export const renameTab = (title, tabPath, onTitleChanged) => {
    actionBuilder('RENAME_TAB')
        .set([tabPath, 'title'], title)
        .dispatch()
    setImmediate(() => onTitleChanged && onTitleChanged(select(tabPath)))
}

export const selectTab = (id, statePath) => {
    actionBuilder('SELECT_TAB')
        .set([statePath, 'selectedTabId'], id)
        .dispatch()
}
