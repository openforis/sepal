import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {LandTrendrGraph} = await import('./landTrendrGraph')

const props = () => ({
    years: [2000, 2001, 2002],
    raw: [10, 20, 30],
    fitted: [11, 21, 31],
    isVertex: [1, 0, 1]
})

// Drives the component without rendering: React only ever calls these in this
// order, and the assertions are about what lands in state.
const mount = (initialProps = props()) => {
    const graph = new LandTrendrGraph(initialProps)
    graph.state = {}
    graph.setState = update => {
        const partial = typeof update === 'function' ? update(graph.state) : update
        graph.state = {...graph.state, ...partial}
    }
    graph.componentDidMount()
    return graph
}

// The Graph widget compares `data` by reference (widget/graph.jsx), so handing
// it a freshly built array on every render makes dygraph redraw the whole chart
// on every mouse move - which is what the hover flicker was.
it('keeps the same data array while hovering', () => {
    const graph = mount()
    const data = graph.state.data
    expect(data).toBeDefined()
    graph.highlightCallback(null, null, [{x: 0.4}], 1)
    graph.componentDidUpdate(graph.props)
    expect(graph.state.data).toBe(data)
})

it('rebuilds the data when a different pixel is charted', () => {
    const graph = mount()
    const data = graph.state.data
    const nextProps = {years: [2010, 2011], raw: [1, 2], fitted: [3, 4], isVertex: [1, 1]}
    const prevProps = graph.props
    graph.props = nextProps
    graph.componentDidUpdate(prevProps)
    expect(graph.state.data).not.toBe(data)
    expect(graph.state.data).toHaveLength(2)
})

it('pins the floating panel to the right when hovering the left half', () => {
    const graph = mount()
    graph.highlightCallback(null, null, [{x: 0.2}], 1)
    expect(graph.state.point.left).toBe(true)
    graph.highlightCallback(null, null, [{x: 0.8}], 1)
    expect(graph.state.point.left).toBe(false)
})

it('reports the hovered observation, and the fitted value only at a vertex', () => {
    const graph = mount()
    graph.highlightCallback(null, null, [{x: 0.5}], 0)
    expect(graph.state.point).toMatchObject({year: 2000, raw: 10, fitted: 11})
    graph.highlightCallback(null, null, [{x: 0.5}], 1)
    expect(graph.state.point).toMatchObject({year: 2001, raw: 20, fitted: null})
})
