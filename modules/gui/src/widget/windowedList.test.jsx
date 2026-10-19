import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// A long list of options as the windowed list shows them: only some rendered at a time, every one still reached by
// the keyboard or as the one selected, and the heading of the group in view kept rendered. There is no layout here:
// rows are placed by estimated heights, and measured at the heights a test reports for them, as ResizeObserver would.

const keymaps = vi.hoisted(() => [])
vi.mock('~/widget/elementResizeDetector', () => ({ElementResizeDetector: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({keymap, children}) => {
    keymaps.push(keymap)
    return children
}}))
const viewport = vi.hoisted(() => ({scrollTop: 0, clientHeight: 400, clientWidth: 400, getBoundingClientRect: () => ({top: 0})}))
const observers = vi.hoisted(() => [])
vi.stubGlobal('ResizeObserver', class {
    constructor(callback) {
        this.callback = callback
        observers.push(this)
    }

    observe() {}

    unobserve() {}

    disconnect() {}
})
vi.mock('~/widget/scrollable', async () => {
    const {NEVER} = await import('rxjs')
    const scrollable = {
        clientHeight: 400,
        mouseAway$: NEVER,
        getElement: () => viewport,
        setScrollTop: top => viewport.scrollTop = top,
        centerElement: () => {},
        scrollElement: () => {}
    }
    return {Scrollable: ({children}) => <div>{children(scrollable)}</div>}
})
vi.mock('~/widget/button', () => ({
    Button: ({label, children, hook, onClick}) => <button data-hook={hook} onClick={onClick}>{label}{children}</button>
}))

import {ScrollableWindowedList} from './windowedList'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container, root

beforeEach(() => {
    keymaps.length = 0
    observers.length = 0
    viewport.scrollTop = 0
    viewport.clientWidth = 400
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

describe('a windowed list of many options', () => {
    it('renders a few of them', () => {
        show({})

        expect(renderedOptions().length).toBeGreaterThan(0)
        expect(renderedOptions().length).toBeLessThanOrEqual(40)
    })

    it('reaches the last by End and selects it with Enter', () => {
        const onSelect = vi.fn()
        show({onSelect})

        act(() => keymap().End())
        act(() => keymap().Enter())

        expect(renderedOptions()).toContain(LAST.label)
        expect(onSelect).toHaveBeenCalledWith(LAST)
        expect(renderedOptions().length).toBeLessThanOrEqual(40)
    })

    it('renders the option selected, however far down it is', () => {
        show({selectedValue: DEEP.value})

        expect(renderedOptions()).toContain(DEEP.label)
    })

    it('keeps the heading of the group in view rendered after a jump', () => {
        show({})

        act(() => keymap().End())

        expect(container.textContent).toContain('Assets')
    })
})

// Heights measured of what is rendered changing what was estimated keep in view what the view was brought to.
describe('a windowed list whose rows measure otherwise than estimated', () => {
    // The view starts most of the way into that row: a part of it no shorter estimate of its height would hold.
    it('keeps the row at the top of the view when narrowing makes rows taller', () => {
        show({})
        measureRows(80)
        scrollTo(60070)
        measureRows(80)
        const top = topRow()

        narrowTo(200)
        measureRows(100)

        expect(topRow()).toBe(top)
    })

    it('keeps the row at the top of the view when widening makes rows shorter', () => {
        show({})
        measureRows(100)
        scrollTo(75090)
        measureRows(100)
        const top = topRow()

        widenTo(600)
        measureRows(40)

        expect(topRow()).toBe(top)
    })

    it('keeps the last option in view after End, though its rows are taller than estimated', () => {
        show({})
        measureRows(40)

        act(() => keymap().End())
        measureRows(100)

        expect(bottomOf(OPTIONS.length - 1)).toBeLessThanOrEqual(viewport.scrollTop + viewport.clientHeight)
    })
})

const OPTIONS = [
    {group: true, key: 'assets', label: 'Assets'},
    ...Array.from({length: 2000}, (_, i) => ({key: `asset-${i}`, value: `asset-${i}`, label: `Asset ${i}`}))
]
const LAST = OPTIONS.at(-1)
const DEEP = OPTIONS[1500]

const show = ({selectedValue, onSelect = () => {}}) =>
    act(() => root.render(
        <ScrollableWindowedList
            options={OPTIONS}
            selectedValue={selectedValue}
            autoHighlight
            keyboard
            onSelect={onSelect}
        />
    ))

const renderedOptions = () => [...container.querySelectorAll('[data-hook="option"]')].map(({textContent}) => textContent)

const scrollTo = top => {
    viewport.scrollTop = top
    show({})
}

const narrowTo = width => {
    viewport.clientWidth = width
    show({})
}

const widenTo = narrowTo

// Rows now this high, the heading its own height: those rendered measured as ResizeObserver reports them.
const measureRows = height => {
    geometry.rowHeight = height
    act(() => observers.at(-1).callback(
        renderedRows().map(target => ({target, borderBoxSize: [{blockSize: rowHeight(target)}]}))
    ))
}

const geometry = {rowHeight: null}

const HEADING_HEIGHT = 34

const renderedRows = () => [...container.querySelectorAll('li[data-window-index]')]

// The option at the top of the view: the first rendered beyond the rows rendered above it.
const topRow = () => {
    let offset = 0
    for (const row of container.querySelectorAll('ul > li')) {
        offset += rowHeight(row)
        if (offset > viewport.scrollTop) {
            return Number(row.dataset.windowIndex)
        }
    }
    return null
}

// Where an option's row ends, from the top of the list: spacers by their height, rows by what they measured.
const bottomOf = index => {
    let offset = 0
    for (const row of container.querySelectorAll('ul > li')) {
        offset += rowHeight(row)
        if (Number(row.dataset.windowIndex) === index) {
            return offset
        }
    }
    return null
}

// A spacer by its height, a row by how high rows are now.
const rowHeight = row => row.dataset.windowIndex === undefined
    ? Number(row.style.getPropertyValue('--height'))
    : Number(row.dataset.windowIndex) === 0 ? HEADING_HEIGHT : geometry.rowHeight

// The list's own keymap, as last rendered.
const keymap = () => keymaps.findLast(map => map.End)
