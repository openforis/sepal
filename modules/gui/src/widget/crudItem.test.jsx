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

describe('CrudItem title tooltip (opt-in)', () => {
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

    // Tooltip entries carrying the given msg (ignores other row tooltips, all of which have different msgs).
    const titleTooltips = msg => tooltipProps.filter(entry => entry.msg === msg)

    beforeEach(() => {
        mounted = []
        tooltipProps.length = 0
    })

    afterEach(() => {
        mounted.forEach(unmount => unmount())
    })

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
