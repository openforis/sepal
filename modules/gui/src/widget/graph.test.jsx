import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Dygraph draws on canvas; the fake records the options each chart was created with, the data it was built with and the
// data it was redrawn with.
const charts = vi.hoisted(() => [])
const built = vi.hoisted(() => [])
const redrawn = vi.hoisted(() => [])
vi.mock('dygraphs', () => ({
    default: class {
        constructor(_element, data, options) {
            charts.push(options)
            built.push(data)
        }

        updateOptions({file}) {
            redrawn.push(file)
        }
    }
}))

import {Enabled} from '~/enabled'
import {initStore} from '~/store'
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
        expect(options.highlightSeriesBackgroundColor).toBe('hsla(39, 40%, 95%, 1)')
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

// Dygraph sizes a chart by its element when it builds it, so a Graph is drawn only where it is displayed: not while what it
// is in is disabled - a panel of a tab not selected (panel.jsx) - but once that is enabled again, as it then stands.
describe('a Graph in what is disabled and enabled again', () => {
    let root, container

    beforeEach(() => {
        built.splice(0)
        redrawn.splice(0)
        initStore(createStore((state = {dimensions: {width: 1024, height: 768}}) => state))
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    const show = (enabled, data) => act(() => root.render(
        <Enabled enabled={enabled}>
            <Graph data={data}/>
        </Enabled>
    ))

    it('is drawn once enabled, from the data it was last given while disabled', () => {
        show(false, FIRST)
        show(false, SECOND)
        expect(built).toEqual([])

        show(true, SECOND)

        expect(built).toEqual([SECOND])
        expect(redrawn).toEqual([])
    })

    it('given new data while disabled, redraws it once enabled, without building it again', () => {
        show(true, FIRST)
        show(false, SECOND)
        expect(redrawn).toEqual([])

        show(true, SECOND)

        expect(built).toEqual([FIRST])
        expect(redrawn).toEqual([SECOND])
    })

    it('is neither built nor redrawn again as it is disabled and enabled again unchanged', () => {
        show(true, FIRST)

        show(false, FIRST)
        show(true, FIRST)

        expect(built).toEqual([FIRST])
        expect(redrawn).toEqual([])
    })
})

const FIRST = [[1, 2]]
const SECOND = [[1, 2], [2, 3]]
