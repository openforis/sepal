import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Enabled} from '~/enabled'
import {initStore, select} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Keybinding} from '~/widget/keybinding'

// A recipe's dialogs, as tabs own them: the real tabs, their content, modal panels and their outside-event detection,
// over a store of two tabs whose content opens dialogs in its own recipe scope. What is asserted is where a dialog
// belongs and what that tab holds of it; native inertness and focus movement are a browser's to show.

const notifications = vi.hoisted(() => ({info: []}))

vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/scrollable', async () => {
    const {NEVER} = await import('rxjs')
    const scrollable = {clientHeight: 0, mouseAway$: NEVER, centerElement: () => {}, scrollElement: () => {}}
    return {
        Scrollable: ({children}) => <div>{typeof children === 'function' ? children(scrollable) : children}</div>,
        withScrollable: () => Component =>
            function WithScrollableStub(props) {
                return <Component {...props} scrollable={{scrollElement: () => {}}}/>
            }
    }
})
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {info: notification => notifications.info.push(notification)}}))

const {Tabs} = await import('./tabs')
const {selectTab} = await import('./tabActions')
const {Panel} = await import('~/widget/panel/panel')
const {ModalScope} = await import('~/widget/panel/modalScope')
const {Combo} = await import('~/widget/combo')
const {FloatingBox} = await import('~/widget/floatingBox')
const {PortalContainer, DEFAULT_PORTAL_CONTAINER_ID} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('a recipe\'s dialog', () => {
    it('is its own tab\'s, shown only while that tab is, its content covered, the other tab\'s not', async () => {
        await mount({A: {dialog: true}, B: {}})

        expect(dialogLayer(A).contains(draft(A))).toBe(true)
        expect(globalLayer().contains(draft(A))).toBe(false)
        expect(isCovered(A)).toBe(true)
        expect(isCovered(B)).toBe(false)

        await show(B)

        expect(isHidden(wrapperOf(draft(A)))).toBe(true)
    })

    it('keeps its draft, the same input as typed, while its tab is left and returned to', async () => {
        await mount({A: {dialog: true}, B: {dialog: true}})
        const input = draft(A)
        await typeInto(input, 'unapplied')

        await show(B)
        await show(A)

        expect(draft(A)).toBe(input)
        expect(input.value).toBe('unapplied')
        expect(isHidden(wrapperOf(draft(A)))).toBe(false)
        expect(isHidden(wrapperOf(draft(B)))).toBe(true)
    })

    it('is covered by a dialog it opens, which stays the recipe\'s, until that dialog closes', async () => {
        await mount({A: {dialog: true, nested: true}, B: {}})

        expect(dialogLayer(A).contains(nested(A))).toBe(true)
        expect(wrapperOf(draft(A)).hasAttribute('inert')).toBe(true)
        expect(wrapperOf(nested(A)).hasAttribute('inert')).toBe(false)

        await open({A: {dialog: true}, B: {}})

        expect(wrapperOf(draft(A)).hasAttribute('inert')).toBe(false)
    })

    it('given the application\'s scope, is the application\'s, and so is what it opens', async () => {
        await mount({A: {application: true, nested: true}, B: {}})

        expect(globalLayer().contains(draft(A))).toBe(true)
        expect(globalLayer().contains(nested(A))).toBe(true)
        expect(isCovered(A)).toBe(false)
    })

    // A list opened from it renders globally, as every popup does: outside the covered content and the tab.
    it('keeps a list it opens usable, choosing from it no dismissal', async () => {
        await mount({A: {dialog: true, combo: true}, B: {}})
        await settleOutsideEventDelay()

        await act(async () => comboInput(A).click())
        await press(option('green'))
        await act(async () => option('green').click())

        expect(option('green')).toBeUndefined()
        expect(chosen).toEqual(['green'])
        expect(backdropClicks).toEqual([])
        expect(draft(A)).not.toBeNull()
    })

    it('hides its global list on keyboard navigation and keeps its draft and list for return', async () => {
        await mount({A: {dialog: true, combo: true}, B: {dialog: true}})
        await typeInto(draft(A), 'unapplied')
        await act(async () => comboInput(A).click())
        const green = option('green')
        expect(green).toBeDefined()

        await key('ArrowRight', {ctrlKey: true, shiftKey: true})

        expect(select('section.selectedTabId')).toBe(B)
        expect(green.closest('[inert]').style.display).toBe('none')
        expect(option('green')).toBeUndefined()
        await key('Enter')
        expect(chosen).toEqual([])

        await show(A)
        expect(draft(A).value).toBe('unapplied')
        expect(option('green')).toBe(green)
        await act(async () => green.click())
        expect(chosen).toEqual(['green'])
        expect(backdropClicks).toEqual([])
    })

    it('suppresses covered recipe shortcuts and restores them after the dialog closes', async () => {
        await mount({A: {dialog: true, shortcut: true}, B: {}})
        await act(async () => draft(A).focus())
        await key('Delete')
        expect(shortcuts).toEqual([])

        await open({A: {shortcut: true}, B: {}})
        await key('Delete')
        expect(shortcuts).toEqual([`${A}:covered`])
    })

    it('does not enable a shortcut first mounted in a hidden tab', async () => {
        await mount({A: {}, B: {shortcut: true}})
        await key('Delete')
        expect(shortcuts).toEqual([])

        await show(B)
        await key('Delete')
        expect(shortcuts).toEqual([`${B}:covered`])
    })

    it('hides its popup and disables its shortcuts when its application section is left', async () => {
        await mount({A: {dialog: true, combo: true, dialogShortcut: true}, B: {}})
        await act(async () => comboInput(A).click())
        const green = option('green')

        await act(async () => setSectionEnabled(false))
        expect(green.closest('[inert]').style.display).toBe('none')
        // The section owns the exit fade: its dialog must stay painted with it, but immediately stop interacting.
        expect(wrapperOf(draft(A)).className).not.toContain('_disabled_')
        expect(draft(A).closest('[class*="_panel_"]').className).not.toContain('_disabled_')
        expect(wrapperOf(draft(A)).hasAttribute('inert')).toBe(true)
        await key('F2')
        expect(shortcuts).toEqual([])

        await act(async () => setSectionEnabled(true))
        expect(option('green')).toBe(green)
        await key('F2')
        expect(shortcuts).toEqual([`${A}:dialog`])
    })

    it('keeps an application override interactive over a recipe dialog', async () => {
        await mount({A: {dialog: true, nested: true, nestedScope: 'application'}, B: {}})
        expect(isCovered(A)).toBe(true)
        expect(globalLayer().contains(nested(A))).toBe(true)
        await key('F3')
        expect(shortcuts).toEqual([`${A}:nested`])
    })

    it('keeps a dialog opened inside a popup active while its covered popup is hidden', async () => {
        await mount({A: {dialog: true, popup: true, popupNested: true}, B: {}})
        const popup = document.querySelector('[data-popup]').closest('[inert]')
        expect(popup.style.display).toBe('none')
        const inner = document.querySelector('[data-popup-nested]')
        expect(dialogLayer(A).contains(inner)).toBe(true)
        expect(isHidden(wrapperOf(inner))).toBe(false)
        expect(inner.closest('[inert]')).toBeNull()
        await key('F4')
        expect(shortcuts).toEqual([`${A}:popup-nested`])
    })

    it('keeps a lower dialog and its global popup inactive while a nested dialog is open', async () => {
        await mount({A: {dialog: true, combo: true, dialogShortcut: true}, B: {}})
        await act(async () => comboInput(A).click())
        const green = option('green')

        await open({A: {dialog: true, combo: true, dialogShortcut: true, nested: true}, B: {}})
        expect(green.closest('[inert]').style.display).toBe('none')
        await key('F2')
        expect(shortcuts).toEqual([])
        await key('F3')
        expect(shortcuts).toEqual([`${A}:nested`])

        await open({A: {dialog: true, combo: true, dialogShortcut: true}, B: {}})
        expect(option('green')).toBe(green)
        await key('F2')
        expect(shortcuts).toEqual([`${A}:nested`, `${A}:dialog`])
    })

    it('restores, on its tab\'s return, the focus it held when the tab was left', async () => {
        await mount({A: {dialog: true}, B: {}})
        await act(async () => draft(A).focus())

        await show(B)
        await act(async () => handle(A).focus())
        await show(A)

        expect(document.activeElement).toBe(draft(A))
    })
})

describe('a recipe dialog\'s backdrop', () => {
    it('is clicked by what is pressed within its tab, outside the dialog, and not by a tab handle', async () => {
        await mount({A: {dialog: true}, B: {}})
        await settleOutsideEventDelay()

        await press(handle(B))
        expect(backdropClicks).toEqual([])

        await press(wrapperOf(draft(A)))
        expect(backdropClicks).toEqual([A])
    })

    it('of a tab not shown is never clicked, and does not keep the shown one\'s from being clicked', async () => {
        await mount({A: {dialog: true}, B: {}})
        await open({A: {dialog: true}, B: {dialog: true}})
        await settleOutsideEventDelay()

        await press(wrapperOf(draft(A)))

        expect(backdropClicks).toEqual([A])
    })
})

describe('closing a tab holding an open dialog', () => {
    it.each([
        ['its close button', tab => closeButton(tab)],
        ['a middle click', tab => handle(tab)]
    ])('by %s, shows the tab and its dialog, says why, and leaves it open', async (how, target) => {
        await mount({A: {}, B: {dialog: true}})
        const input = draft(B)

        await closeBy(how, target(B))

        expect(select('section.tabs').map(({id}) => id)).toEqual([A, B])
        expect(select('section.selectedTabId')).toBe(B)
        expect(draft(B)).toBe(input)
        expect(notifications.info).toEqual([{message: 'widget.tabs.closeWithOpenDialog', timeout: 5}])
        expect(closed).toEqual([])
    })

    it('is closed as before once the dialog is gone', async () => {
        await mount({A: {}, B: {dialog: true}})
        await open({A: {}, B: {}})

        await closeBy('its close button', closeButton(B))

        expect(closed).toEqual([B])
    })
})

const A = 'tab-a'
const B = 'tab-b'

let root, container, store, setOpened, setSectionEnabled, backdropClicks, closed, chosen, shortcuts

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    notifications.info = []
})

// The two tabs, A shown, with the dialogs each opens: its recipe dialog, one that dialog opens, or one given the
// application's scope.
async function mount(opened) {
    backdropClicks = []
    closed = []
    chosen = []
    shortcuts = []
    const tabs = [{id: A, title: 'Recipe A'}, {id: B, title: 'Recipe B'}]
    store = createStore(
        (state = {dimensions: {width: 1024, height: 768}, section: {tabs, selectedTabId: A}}, action) =>
            action.reduce ? action.reduce(state) : state
    )
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Harness initiallyOpened={opened}/>))
}

const Harness = ({initiallyOpened}) => {
    const [opened, setState] = React.useState(initiallyOpened)
    const [sectionEnabled, setEnabled] = React.useState(true)
    setOpened = setState
    setSectionEnabled = setEnabled
    return (
        <Provider store={store}>
            <EventShield>
                <Enabled enabled={sectionEnabled}>
                    <Tabs label='Process' statePath='section' onClose={tab => closed.push(tab.id)}>
                        {({id}) => <RecipeContent id={id} opened={opened[id === A ? 'A' : 'B']}/>}
                    </Tabs>
                </Enabled>
                <PortalContainer/>
            </EventShield>
        </Provider>
    )
}

// What a recipe shows beneath its dialogs - a control - and the dialogs it opens.
const RecipeContent = ({id, opened = {}}) =>
    <div>
        {opened.shortcut ? <Keybinding keymap={{Delete: () => shortcuts.push(`${id}:covered`)}}/> : null}
        <button data-covered={id}>covered</button>
        {opened.dialog || opened.application
            ? (
                <ModalScope scope='recipe'>
                    <Panel placement='modal' scope={opened.application ? 'application' : undefined} onBackdropClick={() => backdropClicks.push(id)}>
                        <input data-draft={id}/>
                        {opened.dialogShortcut ? <Keybinding keymap={{F2: () => shortcuts.push(`${id}:dialog`)}}/> : null}
                        {opened.combo
                            ? <Combo options={BANDS} placeholder={`${id} band`} onChange={({value}) => chosen.push(value)}/>
                            : null}
                        {opened.popup
                            ? <FloatingBox element={document.body}>
                                <input data-popup/>
                                {opened.popupNested
                                    ? <Panel placement='modal'>
                                        <input data-popup-nested/>
                                        <Keybinding keymap={{F4: () => shortcuts.push(`${id}:popup-nested`)}}/>
                                    </Panel>
                                    : null}
                            </FloatingBox>
                            : null}
                        {opened.nested
                            ? <Panel placement='modal' scope={opened.nestedScope}>
                                <input data-nested={id}/>
                                <Keybinding keymap={{F3: () => shortcuts.push(`${id}:nested`)}}/>
                            </Panel>
                            : null}
                    </Panel>
                </ModalScope>
            )
            : null}
    </div>

const BANDS = ['red', 'green', 'blue'].map(value => ({value, label: value}))

async function open(opened) {
    await act(async () => setOpened(opened))
}

async function show(tabId) {
    await act(async () => selectTab(tabId, 'section'))
}

async function key(key, modifiers = {}) {
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...modifiers})))
}

async function press(element) {
    await act(async () => element.dispatchEvent(new MouseEvent('mousedown', {bubbles: true})))
}

async function closeBy(how, element) {
    await act(async () => how === 'a middle click'
        ? element.dispatchEvent(new MouseEvent('auxclick', {button: 1, bubbles: true}))
        : element.click())
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

async function typeInto(input, text) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
}

// Outside events are ignored while an overlay mounts (blurDetector.jsx).
const settleOutsideEventDelay = () => act(async () => new Promise(resolve => setTimeout(resolve, 150)))

const draft = tabId => document.querySelector(`[data-draft="${tabId}"]`)

const comboInput = tabId => document.querySelector(`input[placeholder="${tabId} band"]`)

// An option of an open list, where it is rendered: never under anything inert.
const option = label => [...document.querySelectorAll('[data-hook="option"]')]
    .find(element => element.textContent === label && !element.closest('[inert]'))

const nested = tabId => document.querySelector(`[data-nested="${tabId}"]`)

const dialogLayer = tabId => document.getElementById(`dialogs_tab_${tabId}`)

const globalLayer = () => document.getElementById(DEFAULT_PORTAL_CONTAINER_ID)

const wrapperOf = element => element.closest('[class*="_modalWrapper_"]')

// The dialog lives inside its tab: that owner's opacity and inertness hide it, rather than a second hide rule.
const isHidden = element => element.closest('[class*="_tabContent_"]').hasAttribute('inert')

// Whether the tab's content is covered by its dialogs: the content's own wrapper made inert, not the tab as a whole.
const isCovered = tabId => document.querySelector(`[data-covered="${tabId}"]`).closest('[class*="_covered_"]').hasAttribute('inert')

const handle = tabId => [...container.querySelectorAll('input')]
    .find(input => input.value === (tabId === A ? 'Recipe A' : 'Recipe B'))

// The tab handle's one button.
const closeButton = tabId => handle(tabId).closest('[class*="_tab_"]').querySelector('button')
