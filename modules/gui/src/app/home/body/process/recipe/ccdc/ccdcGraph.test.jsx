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

import {ccdcChart} from './ccdcChart'
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

// What the readout says of the model and the segment it is evaluated from.
describe('the model readout', () => {
    it('shows an extrapolated day\'s model and the segment it is extrapolated from, as drawn', () => {
        show(segmentsFrom(START), {endDate: new Date(END + 5 * DAY), gapStrategy: 'EXTRAPOLATE'})
        hover(rowAt(START + DAY), 0.2)
        const fitted = modelReadout()

        hover(rowAt(END + 2 * DAY), 0.8)

        expect(modelReadout()).toEqual(fitted)
        expect(modelReadout().model).not.toContain('–')
    })

    it('shows no model on a masked day', () => {
        show(segmentsFrom(START), {endDate: new Date(END + 5 * DAY), gapStrategy: 'MASK'})

        hover(rowAt(END + 2 * DAY), 0.8)

        expect(modelReadout().model).toContain('–')
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

const show = (segments, chart = {}) => {
    initStore(createStore((state = {dimensions: {width: 1024, height: 768}}) => state))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <CCDCGraph chart={ccdcChart({
            band: 'ndvi',
            dateFormat: 2,
            startDate: new Date(START),
            endDate: new Date(END),
            segments,
            observations: {features: [0, 3, 9].map(day => ({properties: {date: {value: START + day * DAY}, value: 0.5}}))},
            ...chart
        })}/>
    ))
}

const hover = (row, x) => act(() => graph.props.highlightCallback(
    null, graph.props.data[row][0].getTime(), [{name: 'observations', x}], row
))

const rowAt = time => graph.props.data.findIndex(([date]) => date.getTime() === time)

const MODEL_FIELDS = ['model', 'startDate', 'endDate', 'rmse', 'magnitude', 'observationCount']

const modelReadout = () => Object.fromEntries(MODEL_FIELDS.map(field =>
    [field, document.querySelector(`[data-label="process.ccdc.mapToolbar.ccdcGraph.${field}.label"]`).textContent]
))

const readout = () => document.querySelector('[data-label="process.ccdc.mapToolbar.ccdcGraph.date.label"]').parentElement
