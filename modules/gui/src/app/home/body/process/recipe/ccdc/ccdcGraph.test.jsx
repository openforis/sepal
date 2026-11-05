import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

const graph = vi.hoisted(() => ({props: null}))
vi.mock('~/widget/graph', () => ({
    Graph: props => {
        graph.props = props
        return <div/>
    },
    graphColor: name => name
}))
vi.mock('~/translate', () => ({msg: key => key}))

import {CCDCGraph} from './ccdcGraph'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
})

describe('the charted point readout', () => {
    it.each([
        {kind: 'observations', segments: undefined},
        {kind: 'fitted points', segments: segmentsFrom(START)},
        {kind: 'observations before a fitted segment', segments: segmentsFrom(START + DAY)}
    ])('moves opposite the hovered $kind as the pointer crosses the chart', ({segments}) => {
        show(segments)

        hover(0, 0.05)

        expect(readout().style.right).toBe('0px')
        expect(readout().textContent).toContain('2020-01-01')
        expect(readout().textContent).toContain('0.5')

        hover(graph.props.data.length - 1, 0.95)

        expect(readout().style.right).toBe('')
    })
})

const DAY = 86400000
const START = Date.UTC(2020, 0, 1)
const END = START + 10 * DAY

function segmentsFrom(start) {
    return {
        tStart: [start], tEnd: [END], tBreak: [0], changeProb: [0], numObs: [3],
        ndvi_coefs: [[0.5, 0, 0, 0, 0, 0, 0, 0]], ndvi_rmse: [0.02], ndvi_magnitude: [0]
    }
}

const show = segments => {
    initStore(createStore((state = {dimensions: {width: 1024, height: 768}}) => state))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <CCDCGraph
            band='ndvi'
            dateFormat={2}
            startDate={new Date(START)}
            endDate={new Date(END)}
            segments={segments}
            observations={{features: [0, 3, 9].map(day => ({properties: {date: {value: START + day * DAY}, value: 0.5}}))}}
        />
    ))
}

const hover = (row, x) => act(() => graph.props.highlightCallback(
    null, graph.props.data[row][0].getTime(), [{name: 'observations', x}], row
))

const readout = () => document.querySelector('[data-label="process.ccdc.mapToolbar.ccdcGraph.date.label"]').parentElement
