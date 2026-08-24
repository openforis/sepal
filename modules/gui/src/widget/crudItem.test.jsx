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

import {CrudItem} from './crudItem'

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

// A line for whatever belongs WITH the timestamp rather than in a column of its own — a running
// cost, a size, a count. The timestamp block is a right-aligned column, so it lands under the
// relative time.
describe('CrudItem timestamp footnote (opt-in)', () => {
    const timestampBlock = container => container.querySelector('[class*="timestamp"]')
    const timestampLines = container =>
        [...timestampBlock(container).children].map(({textContent}) => textContent)

    it('renders nothing extra by default', () => {
        const container = mount({title: 'My label', timestamp: '2026-08-17T07:17:29.000Z'})
        expect(timestampLines(container)).toHaveLength(2) // absolute and relative
    })

    it('renders the footnote under the timestamps', () => {
        const container = mount({
            title: 'My label',
            timestamp: '2026-08-17T07:17:29.000Z',
            timestampFootnote: '$0.04'
        })
        expect(timestampLines(container).at(-1)).toBe('$0.04')
    })

    // Without a timestamp there is no block to hang it under, and a footnote floating on its own
    // would read as a column — which is the layout it exists to avoid.
    it('needs a timestamp to hang under', () => {
        const container = mount({title: 'My label', timestampFootnote: '$0.04'})
        expect(timestampBlock(container)).toBeNull()
        expect(container.textContent).not.toContain('$0.04')
    })
})
