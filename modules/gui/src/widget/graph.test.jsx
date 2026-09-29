import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Dygraph draws on canvas; the fake records the options each chart was created with.
const charts = vi.hoisted(() => [])
vi.mock('dygraphs', () => ({
    default: class {
        constructor(_element, _data, options) {
            charts.push(options)
        }

        updateOptions() {}
    }
}))

import {themeManager} from '~/theme'

import {Graph, graphColor} from './graph'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Graph chrome colors', () => {
    let unmount

    beforeEach(() => charts.splice(0))
    afterEach(() => {
        unmount()
        themeManager.setPreference('dark')
    })

    const render = () => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <Graph
                data={[[1, 2]]}
                highlightSeriesBackgroundColor={graphColor('highlightBackground')}
                series={{observations: {color: graphColor('foreground')}, fitted: {color: '#FF0000'}}}
            />
        ))
        unmount = () => {
            act(() => root.unmount())
            container.remove()
        }
    }

    it('draws with the colors of the active theme', () => {
        themeManager.setPreference('light')

        render()

        const options = charts.at(-1)
        expect(options.highlightSeriesBackgroundColor).toBe('hsla(40, 22%, 99%, 1)')
        expect(options.series.observations.color).toBe('#2b2926')
        expect(options.series.fitted.color).toBe('#FF0000')
    })

    it('redraws with the new theme when the theme changes', () => {
        themeManager.setPreference('dark')
        render()

        act(() => themeManager.setPreference('light'))

        expect(charts.at(0).series.observations.color).toBe('#FFFFFF')
        expect(charts.at(-1).series.observations.color).toBe('#2b2926')
    })
})
