import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/apiRegistry', () => ({default: {}}))
vi.mock('./taskDetails', () => ({TaskDetails: () => null}))
// Like the real list, a row redraws only when its key or its task changes.
vi.mock('~/widget/fastList', async () => {
    const {memo} = await import('react')
    const Row = memo(({item, itemRenderer}) => itemRenderer(item, false))
    return {
        FastList: ({items, itemKey, itemRenderer}) =>
            items.map(item => <Row key={itemKey(item)} item={item} itemRenderer={itemRenderer}/>)
    }
})
vi.mock('~/widget/crudItem', () => ({
    CrudItem: ({description}) => <div data-description>{description}</div>
}))
vi.mock('~/widget/listItem', () => ({ListItem: ({children}) => children}))
vi.mock('~/widget/sectionLayout', () => ({
    SectionLayout: ({children}) => children,
    TopBar: () => null,
    Content: ({children}) => children
}))
vi.mock('~/widget/layout', () => ({Layout: ({children}) => children}))
vi.mock('~/widget/searchBox', () => ({SearchBox: () => null}))
vi.mock('~/widget/buttons', () => ({Buttons: () => null}))
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => children}))

import {Tasks} from './tasks'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Tasks', () => {
    it('distinguishes named exports from the same notebook', () => {
        const taskInfo = {kind: 'IMAGE', destination: 'SEPAL', origin: {type: 'NOTEBOOK', path: 'analysis.ipynb'}}
        renderTasks({tasks: [
            {id: 'ndvi', name: 'Export NDVI to SEPAL', description: 'NDVI', status: 'COMPLETED', taskInfo},
            {id: 'evi', name: 'Export EVI to SEPAL', description: 'EVI', status: 'COMPLETED', taskInfo}
        ]})

        expect(descriptions()).toEqual(['NDVI · ~/analysis.ipynb', 'EVI · ~/analysis.ipynb'])
    })

    it('keeps the task name when an export has no description or recorded origin', () => {
        renderTasks({tasks: [{
            id: 'legacy', name: 'Export plots to SEPAL', status: 'COMPLETED',
            taskInfo: {kind: 'TABLE', destination: 'SEPAL'}
        }]})

        expect(descriptions()).toEqual(['Export plots to SEPAL · tasks.details.originNotRecorded'])
    })
})

let container
let root

beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

// connect() gives the page its stream; no task action is running here.
const renderTasks = ({tasks}) =>
    act(() => root.render(<Tasks tasks={tasks} projects={[]} stream={() => ({active: false})}/>))

const descriptions = () =>
    [...container.querySelectorAll('[data-description]')].map(element => element.textContent)
