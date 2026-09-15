import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {crudItemProps} = vi.hoisted(() => ({crudItemProps: []}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: props => {
        crudItemProps.push(props)
        return null
    }
}))
vi.mock('~/widget/listItem', () => ({ListItem: ({children}) => children}))
vi.mock('~/translate', () => ({msg: key => key}))

import {FolderItem} from './folderItem'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const folder = {id: 'kenya', name: 'Kenya'}

let mounted

const mount = props => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<FolderItem {...props}/>))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const lastProps = () => crudItemProps[crudItemProps.length - 1]

beforeEach(() => {
    mounted = []
    crudItemProps.length = 0
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('FolderItem', () => {
    it('shows the folder name with both counts when it has subfolders', () => {
        mount({folder, counts: {folders: 2, recipes: 4}, onClick: () => {}})

        expect(lastProps().title).toBe('Kenya')
        expect(lastProps().description).toBe('process.project.folderCount · process.project.description')
    })

    it('omits the folder count on a leaf folder', () => {
        mount({folder, counts: {folders: 0, recipes: 4}, onClick: () => {}})

        expect(lastProps().description).toBe('process.project.description')
    })

    it('offers edit and remove when handlers are given', () => {
        mount({folder, counts: {folders: 0, recipes: 0}, onClick: () => {}, onEdit: () => {}, onRemove: () => {}})

        expect(lastProps().onEdit).toBeInstanceOf(Function)
        expect(lastProps().onRemove).toBeInstanceOf(Function)
    })

    it('names what removal asks about, rather than a bare confirmation', () => {
        mount({folder, counts: {folders: 0, recipes: 0}, onClick: () => {}, onRemove: () => {}})

        expect(lastProps().removeTitle).toBe('process.project.remove.title')
        expect(lastProps().removeMessage).toBe('process.project.remove.confirm')
    })

    it('offers neither edit nor remove without handlers', () => {
        mount({folder, counts: {folders: 0, recipes: 0}, onClick: () => {}})

        expect(lastProps().onEdit).toBeUndefined()
        expect(lastProps().onRemove).toBeUndefined()
    })
})
