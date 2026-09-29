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

import {CopyButton} from './copyButton'
import {CrudItem} from './crudItem'
import {RemoveButton} from './removeButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let mounted

const mount = props => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<CrudItem {...props}/>))
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
