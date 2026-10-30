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
    CrudItem: ({description, descriptionTooltip}) => <div data-description data-tooltip={descriptionTooltip}>{description}</div>
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
    it('shows the folders of a recipe task once they load', () => {
        const task = recipeTask({folderId: 'brazil', recipeName: 'Mosaic 2024'})
        renderTasks({tasks: [task], folders: []})

        renderTasks({tasks: [task], folders: [folder('amazon', 'Amazon'), folder('brazil', 'Brazil', 'amazon')]})

        expect(descriptions()).toEqual(['/ Amazon / Brazil / Mosaic 2024'])
    })

    it('gives the whole path of a recipe task on hover, as the row may cut it', () => {
        const task = recipeTask({folderId: 'brazil', recipeName: 'Mosaic 2024'})

        renderTasks({tasks: [task], folders: [folder('amazon', 'Amazon'), folder('brazil', 'Brazil', 'amazon')]})

        expect(descriptionTooltips()).toEqual(['/ Amazon / Brazil / Mosaic 2024'])
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
const renderTasks = ({tasks, folders}) =>
    act(() => root.render(<Tasks tasks={tasks} folders={folders} stream={() => ({active: false})}/>))

const descriptions = () =>
    [...container.querySelectorAll('[data-description]')].map(element => element.textContent)

const descriptionTooltips = () =>
    [...container.querySelectorAll('[data-description]')].map(element => element.dataset.tooltip)

const recipeTask = ({folderId, recipeName}) => ({
    id: 'task-1',
    name: `Retrieve recipe: ${recipeName}`,
    description: recipeName,
    status: 'COMPLETED',
    taskInfo: {recipeType: 'MOSAIC', destination: 'SEPAL', folderId}
})

const folder = (id, name, parentId = null) =>
    ({id, name, parentId})
