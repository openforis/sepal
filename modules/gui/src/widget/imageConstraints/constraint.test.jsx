import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

// A saved constraint whose image is switched in the real constraint panel and form: the band or property the new image
// offers alone is taken, a categorical band is compared by class and a continuous one by value, several choices are left
// to be made, and a cancelled switch is not applied. The panel is always active; its closing is observed.

vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// The class legend, which reads its recipe, is not rendered: the classes chosen are the saved ones.
vi.mock('~/widget/legend/legend', () => ({Legend: () => null}))
const deactivate = vi.hoisted(() => ({calls: 0}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => deactivate.calls++}}/>
    )
}))

const {initStore} = await import('~/store')
const {ActivationContext} = await import('~/widget/activation/activationContext')
const {ImageConstraints} = await import('./imageConstraints')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, applied

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    deactivate.calls = 0
})

describe('a band constraint switched to another image', () => {
    it('takes the one band it offers, compared by value once the band is continuous', async () => {
        await open({images: BAND_IMAGES, constraint: CLASS_CONSTRAINT, applyOn: 'bands'})

        await choose(IMAGE, 'Index')
        await typeInto(VALUE, '0.5')
        await press('button.apply')

        expect(applied()).toMatchObject({image: 'index', band: 'ndvi', operator: '<', value: 0.5})
    })

    it('takes the one categorical band it offers, compared by class', async () => {
        await open({images: BAND_IMAGES, constraint: {...VALUE_CONSTRAINT}, applyOn: 'bands'})

        await choose(IMAGE, 'Classes')
        await press('button.apply')

        expect(applied()).toMatchObject({image: 'classes', band: 'class', operator: 'class'})
    })

    it('leaves a band to be chosen where it offers several, applying nothing until one is', async () => {
        await open({images: BAND_IMAGES, constraint: VALUE_CONSTRAINT, applyOn: 'bands'})

        await choose(IMAGE, 'Optical')

        expect(applyEnabled()).toBe(false)
    })

    it('is not applied when cancelled, nor anything written by opening it', async () => {
        await open({images: BAND_IMAGES, constraint: CLASS_CONSTRAINT, applyOn: 'bands'})

        await choose(IMAGE, 'Index')
        await press('button.cancel')

        expect(applied()).toBeUndefined()
        expect(deactivate.calls).toBe(1)
    })
})

describe('a property constraint switched to another image', () => {
    it('takes the one property it offers', async () => {
        await open({images: PROPERTY_IMAGES, constraint: PROPERTY_CONSTRAINT, applyOn: 'properties'})

        await choose(IMAGE, 'Plots')
        await press('button.apply')

        expect(applied()).toMatchObject({image: 'plots', property: 'height', operator: '=', value: 5})
    })
})

const IMAGE = 'widget.imageConstraints.image.label'
const VALUE = 'widget.imageConstraints.value.label'

const BAND_IMAGES = [
    {id: 'classes', description: 'Classes', bands: [{name: 'class', type: 'categorical', legendEntries: [{value: 1, label: 'Forest'}]}]},
    {id: 'index', description: 'Index', bands: [{name: 'ndvi', type: 'continuous'}]},
    {id: 'optical', description: 'Optical', bands: [{name: 'red', type: 'continuous'}, {name: 'nir', type: 'continuous'}]}
]

const PROPERTY_IMAGES = [
    {id: 'plots', description: 'Plots', properties: [{name: 'height', type: 'number'}]},
    {id: 'sites', description: 'Sites', properties: [{name: 'name', type: 'string'}, {name: 'area', type: 'number'}]}
]

const CLASS_CONSTRAINT = {id: 'c-1', image: 'classes', band: 'class', operator: 'class', selectedClasses: [1]}
const VALUE_CONSTRAINT = {id: 'c-1', image: 'index', band: 'ndvi', operator: '<', value: 0.5}
const PROPERTY_CONSTRAINT = {id: 'c-1', image: 'sites', property: 'area', operator: '=', value: 5}

const open = async ({images, constraint, applyOn}) => {
    const changes = []
    applied = () => changes.at(-1)?.constraints[0]
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <ImageConstraints
                            id='constraints'
                            title='Constraints'
                            images={images}
                            constraints={[constraint]}
                            applyOn={applyOn}
                            onChange={change => changes.push(change)}
                        />
                    </PortalContext>
                </EventShield>
            </ActivationContext>
        </Provider>
    ))
    await settled()
    await click(constraintRow())
}

const constraintRow = () => document.querySelector('[class*="verticalWrapper"]').firstElementChild

const field = label => document.querySelector(`[data-label="${label}"]`)

async function choose(label, option) {
    await click(field(label).querySelector('input'))
    await click([...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent.includes(option)))
}

async function typeInto(label, text) {
    const input = field(label).querySelector('input')
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

const applyEnabled = () => button('button.apply')?.disabled === false

async function press(label) {
    await click(button(label))
}

async function click(element) {
    await act(async () => element.click())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
