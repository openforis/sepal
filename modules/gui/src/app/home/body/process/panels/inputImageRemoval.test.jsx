import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// An input removed from the input imagery a recipe lists, as each of its panels removes it, over a real store. A saved
// recipe can hold two inputs of one source - an asset or a recipe - each its own entry.

// Storage never answers: what is saved is not the concern here.
vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER}}}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The list is open; the panel editing one input is not.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id}) => Component => props => id === 'inputImagery'
        ? <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        : null
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{activatables: {inputImage: {activate: () => {}}}}}/>
}))

const {InputImagery: SharedInputImagery} = await import('./inputImagery/inputImagery')
const {InputImagery: DerivedInputImagery} = await import('./inputImageryWithDerived/inputImagery')
const {InputImagery: BandMathInputImagery} = await import('../recipe/bandMath/panels/inputImagery/inputImagery')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'recipe-1'

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

const PANELS = [
    ['Stack and Remapping', SharedInputImagery],
    ['the classification family', DerivedInputImagery],
    ['Band Math', BandMathInputImagery]
]

const SOURCES = [
    ['an asset', {type: 'ASSET', id: 'users/x/image'}],
    ['a recipe', {type: 'RECIPE_REF', id: 'mosaic-1'}]
]

describe.each(PANELS)('an input removed in the input imagery of %s', (_panel, InputImagery) => {
    describe.each(SOURCES)('where two inputs share %s', (_source, source) => {
        it.each([
            ['first', 0],
            ['second', 1]
        ])('is the %s alone, leaving the other as configured', async (_case, removed) => {
            const inputs = [input('input-a', source, ['red']), input('input-b', source, ['nir'])]
            const remaining = inputs[1 - removed]
            await openInputImagery(InputImagery, inputs)

            await remove(rows()[removed])

            expect(model().inputImagery.images).toEqual([remaining])
            expect(ui().inputImagery.images.map(({imageId}) => imageId)).toEqual([remaining.imageId])
            expect(rows()).toHaveLength(1)
        })
    })
})

describe('an input of the classification family removed while another shares its source', () => {
    it('leaves the source on the map until the last input of it is removed', async () => {
        const source = {type: 'ASSET', id: 'users/x/image'}
        await openInputImagery(DerivedInputImagery, [input('input-a', source, ['red']), input('input-b', source, ['nir'])], {
            additionalImageLayerSources: [{id: source.id, type: 'Asset', sourceConfig: {asset: source.id}}],
            areas: {center: {id: 'area-1', imageLayer: {sourceId: source.id}}}
        })

        await remove(rows()[0])
        expect(layerSourceIds()).toEqual([source.id])
        expect(areaSourceIds()).toEqual([source.id])

        await remove(rows()[0])
        expect(layerSourceIds()).toEqual([])
        expect(areaSourceIds()).not.toContain(source.id)
    })
})

const input = (imageId, {type, id}, bands) => ({
    imageId, name: imageId, type, id,
    includedBands: bands.map(name => ({id: `${imageId}-${name}`, name}))
})

// What the panel editing an input holds for it: the values its model maps to.
const values = ({imageId, type, id}) => ({imageId, section: type, [type === 'ASSET' ? 'asset' : 'recipe']: id})

const openInputImagery = async (InputImagery, images, layers = {}) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID, type: 'STACK', revision: 1,
                    model: {inputImagery: {images}},
                    ui: {initialized: true, inputImagery: {images: images.map(values)}},
                    layers
                }
            },
            recipes: [{id: ID, name: 'Recipe', type: 'STACK', revision: 1}, {id: 'mosaic-1', name: 'Mosaic', type: 'MOSAIC', revision: 1}],
            saveStates: {},
            tabs: [{id: ID}]
        },
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <Recipe id={ID}>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <InputImagery/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </Provider>
    ))
    await settled()
}

// The inputs listed, in order, each by the button removing it.
const rows = () => [...document.querySelectorAll('svg[data-icon="trash"]')].map(icon => icon.closest('button'))

// A row's remove button pressed, and the removal confirmed where it asks to be, as a user does.
const remove = async removeButton => {
    await press(removeButton)
    const confirm = [...document.querySelectorAll('button')].find(button => button.textContent === 'button.remove')
    confirm && await press(confirm)
    await settled()
}

const press = button => act(async () => {
    button.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
    button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
    button.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}))
    button.dispatchEvent(new MouseEvent('click', {bubbles: true}))
})

const recipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const model = () => recipe().model

const ui = () => recipe().ui

const layerSourceIds = () => (recipe().layers.additionalImageLayerSources || []).map(({id}) => id)

const areaSourceIds = () => Object.values(recipe().layers.areas || {}).map(({imageLayer}) => imageLayer?.sourceId)

const settled = () => act(async () => {})
