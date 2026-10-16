import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Capture what the title passes to the shared Tooltip; a passthrough avoids the real Tooltip's store deps.
const {tooltipProps} = vi.hoisted(() => ({tooltipProps: []}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, placement, disabled, children}) => {
        tooltipProps.push({msg, placement, disabled})
        return children
    }
}))
vi.mock('~/widget/userAgent', () => ({isMobile: () => false}))

import {CopyButton} from './copyButton'
import {CrudItem} from './crudItem'
import styles from './crudItem.module.css'
import {LegendItem} from './legend/legendItem'
import {FastListContext} from './fastList'
import {RemoveButton} from './removeButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let mounted

const mount = (props, {inFastList = false} = {}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <FastListContext.Provider value={inFastList}>
            <CrudItem {...props}/>
        </FastListContext.Provider>
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
    return container
}

beforeEach(() => {
    mounted = []
    tooltipProps.length = 0
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('CrudItem title tooltip (opt-in)', () => {
    // Tooltip entries carrying the given msg (ignores other row tooltips, all of which have different msgs).
    const titleTooltips = msg => tooltipProps.filter(entry => entry.msg === msg)

    it('does not wrap the title in a tooltip by default', () => {
        const container = mount({title: 'My label'})
        expect(container.textContent).toContain('My label')
        expect(titleTooltips('My label')).toHaveLength(0)
    })

    it('wraps the title in the shared Tooltip when titleTooltip is set', () => {
        mount({title: 'My label', titleTooltip: 'My label', titleTooltipPlacement: 'top'})
        const entries = titleTooltips('My label')
        expect(entries).toHaveLength(1)
        expect(entries[0].placement).toBe('top')
        expect(entries[0].disabled).toBeFalsy()
    })

    it('suppresses the title tooltip when titleTooltipDisabled is true', () => {
        mount({title: 'My label', titleTooltip: 'My label', titleTooltipDisabled: true})
        expect(titleTooltips('My label')[0].disabled).toBe(true)
    })
})

describe('CrudItem remove confirmation', () => {
    it('forwards an opt-in confirmation label to its remove action', () => {
        const element = CrudItem({
            title: 'Image bands',
            removeConfirmationLabel: 'Remove all',
            onRemove: vi.fn()
        })
        const item = new element.type(element.props)

        const removeButton = item.renderRemoveButton()

        expect(removeButton.props.confirmationLabel).toBe('Remove all')
    })
})

describe('CrudItem copy action', () => {
    const buttonsOf = props => {
        const element = CrudItem({title: 'Instance', ...props})
        const item = new element.type(element.props)
        return item.renderButtons().props.children.filter(Boolean)
    }

    it('offers the value between edit and remove', () => {
        const buttons = buttonsOf({copyValue: 'alice+humble-robin@ssh.sepal.io', onEdit: vi.fn(), onRemove: vi.fn()})
        expect(buttons.map(({type}) => type)).toEqual([expect.anything(), CopyButton, RemoveButton])
        expect(buttons[1].props.value).toBe('alice+humble-robin@ssh.sepal.io')
    })

    it('stays in place, disabled, when there is nothing to copy', () => {
        const [copy] = buttonsOf({copyValue: null, copyDisabled: true})
        expect(copy.type).toBe(CopyButton)
        expect(copy.props.disabled).toBe(true)
    })

    it('offers no copy action by default', () => {
        expect(buttonsOf({})).toEqual([])
    })
})

describe('CrudItem timestamp', () => {
    it('shows the time relative to now, with the full timestamp in a tooltip', () => {
        const container = mount({title: 'My label', timestamp: '2026-08-17T07:17:29.000Z'})
        const timestamp = container.querySelector('[class*="timestamp"]')
        expect(timestamp.textContent).toMatch(/ ago$/)
        expect(tooltipProps.map(({msg}) => msg)).toContainEqual(expect.stringMatching(/^2026-08-1[67] \d{2}:\d{2}:29$/))
    })

    it('shows no timestamp when there is none', () => {
        const container = mount({title: 'My label'})
        expect(container.querySelector('[class*="timestamp"]')).toBeNull()
    })
})

describe('CrudItem error mark', () => {
    const FOLLOWS = Node.DOCUMENT_POSITION_FOLLOWING

    it.each([undefined, false, true])('reserves a legend selection mark only when selection is specified: %s', selected => {
        const container = mount({
            content: <LegendItem color='#228833' label='Forest' value={1} selected={selected} onClick={vi.fn()}/>,
            error: 'Reads a removed input'
        })
        expect(!!container.querySelector('[data-icon="check"]')).toBe(selected !== undefined)
    })

    it.each([false, true])('marks custom content beside it, with remove action: %s', withAction => {
        const props = {
            content: <span data-content>Forest</span>,
            removeConfirmationLabel: 'Remove',
            onRemove: withAction ? vi.fn() : undefined
        }
        const unmarked = mount(props)
        const marked = mount({...props, error: 'Reads a removed input'})
        const [content, mark, remove] = [
            marked.querySelector('[data-content]'),
            marked.querySelector('[data-feedback="error"]'),
            marked.querySelector('button')
        ]

        expect(content.compareDocumentPosition(mark) & FOLLOWS).toBeTruthy()
        if (withAction) {
            expect(mark.compareDocumentPosition(remove) & FOLLOWS).toBeTruthy()
        } else {
            expect(remove).toBeNull()
        }
        // Content and its indicator share the title layout, separately from the action group.
        const indicator = mark.parentElement
        expect(indicator.previousElementSibling.contains(content)).toBe(true)
        expect(indicator.nextElementSibling).toBeNull()
        expect(mark.closest(`.${styles.titleRow}`)).not.toBeNull()
        expect(leadingElement(marked).contains(mark)).toBe(true)
        expect(leadingElement(marked).nextElementSibling.contains(mark)).toBe(false)
        expect(mark.getAttribute('role')).toBe('img')
        expect(leadingElement(marked).contains(content)).toBe(true)
        expect(leadingElement(unmarked).contains(unmarked.querySelector('[data-content]'))).toBe(true)
    })

    it('marks a title after it', () => {
        const container = mount({title: 'Image bands', error: 'Band missing'})
        const title = container.querySelector(`.${styles.title}`)

        expect(title.compareDocumentPosition(container.querySelector('[data-feedback="error"]')) & FOLLOWS).toBeTruthy()
    })

    // The row's first element: what a reader meets first, at the row's start.
    const leadingElement = container => container.querySelector(`.${styles.content}`)
})

// A FastList places every row by one row's height, so a row there may not grow by wrapping a line.
describe('CrudItem lines', () => {
    const lines = container => container.querySelector('[class*="info"]')

    it('keeps each line to one in a row of a FastList', () => {
        const container = mount({title: 'Optical mosaic', description: 'nairobi_mosaic'}, {inFastList: true})
        expect(lines(container).className).toMatch(/nowrap/)
    })

    it('lets a line wrap anywhere else', () => {
        const container = mount({title: 'Optical mosaic', description: 'nairobi_mosaic'})
        expect(lines(container).className).not.toMatch(/nowrap/)
    })
})
