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

import {RecipeItem} from './recipeItem'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const recipe = {id: 'r1', name: 'nairobi_mosaic', type: 'MOSAIC', updateTime: '2026-01-01T00:00:00Z'}

let mounted

const mount = props => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<RecipeItem {...props}/>))
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

describe('RecipeItem', () => {
    it('leads with the recipe name and follows with its type', () => {
        mount({recipe, typeName: 'Optical mosaic', path: '', onClick: () => {}})

        expect(lastProps().title).toBe('nairobi_mosaic')
        expect(lastProps().description).toBe('Optical mosaic')
    })

    it('shows no path while browsing a folder', () => {
        mount({recipe, typeName: 'Optical mosaic', path: '', onClick: () => {}})

        expect(lastProps().description).toBe('Optical mosaic')
    })

    // The path rides in the description rather than the metadata slot: only the description is
    // highlighted, and it sits on the left where the search match is actually readable.
    it('leads the description with the folder path when given one', () => {
        mount({recipe, typeName: 'Optical mosaic', path: 'Kenya / 2024', onClick: () => {}})

        expect(lastProps().description).toBe('Kenya / 2024 · Optical mosaic')
        expect(lastProps().metadata).toBeUndefined()
    })

    it('offers selection instead of the row actions while editing', () => {
        mount({recipe, typeName: 'Optical mosaic', path: '', edit: true, selected: true,
            onClick: () => {}, onSelect: () => {}, onRemove: () => {}, onDuplicate: () => {}})

        expect(lastProps().selected).toBe(true)
        expect(lastProps().onSelect).toBeInstanceOf(Function)
        expect(lastProps().onRemove).toBeUndefined()
        expect(lastProps().onDuplicate).toBeUndefined()
    })
})
