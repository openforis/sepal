import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {withForm} from '~/widget/form/form'
import {PortalContainer} from '~/widget/portal'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/apiRegistry', () => ({default: {}}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/app/home/body/process/recipe/sources/recipeInput', () => ({RecipeInput: () => null}))

const {ForestMask, forestMaskFields} = await import('./forestMask')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, form, inputs

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('the forest mask choice', () => {
    it('starts a custom mask over once another choice is made', async () => {
        show({forestMaskType: 'SOURCE', forestMaskSourceType: 'ASSET', forestMaskAsset: 'projects/p/assets/forest'})

        await choose('HANSEN')
        await choose('SOURCE')

        expect(inputs.forestMaskAsset.value).toBe('')
        expect(inputs.forestMaskRecipe.value).toBe('')
    })

    it('leaves nothing to apply after a custom mask is chosen and abandoned', async () => {
        show({forestMaskType: 'HANSEN', forestMaskThreshold: 30})

        await choose('SOURCE')
        await act(async () => inputs.forestMaskAsset.set('projects/p/assets/forest'))
        await choose('HANSEN')

        expect(form.isDirty()).toBe(false)
    })
})

// A saved mask opens with the fields the panel loads, and every other field blank (setInitialValues, form.jsx).
const show = values => {
    const Host = withForm({fields: forestMaskFields})(props => {
        inputs = props.inputs
        form = props.form
        return <ForestMask inputs={props.inputs}/>
    })
    const blank = Object.fromEntries(Object.keys(forestMaskFields).map(name => [name, '']))
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <EventShield>
                <Host values={{...blank, ...values}}/>
            </EventShield>
        </Provider>
    ))
}

const choose = type =>
    act(async () => inputs.forestMaskType.set(type))
