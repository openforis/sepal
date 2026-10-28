import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import lookStyles from '~/style/look.module.css'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'

import {SourceKind} from './sourceTypeButtons'

// The kind of a source chosen beside its picker, in a form: one value decides the kind chosen and the picker shown. A
// kind not yet chosen starts as the one declared, where the form starts; a saved one is kept; choosing the other is an
// edit its caller is told of. The picker here shows which kind it is for, and the kind buttons it is given.

vi.mock('~/translate', () => ({msg: key => key}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, form, changes

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['an image input', 'ASSET', 'RECIPE_REF'],
    ['a reference', 'RECIPE_REF', 'RECIPE_REF'],
    ['a training sample', 'ASSET', 'RECIPE']
])('the kind of %s', (_caller, defaultKind, recipe) => {
    it('not yet chosen, starts as the one declared, chosen alone and shown, unedited', async () => {
        await open({defaultKind, recipe})

        expect(chosen()).toEqual([labelOf(defaultKind, recipe)])
        expect(picker()).toBe(defaultKind === recipe ? 'recipe' : 'asset')
        expect(form.isDirty()).toBe(false)
    })

    it('saved, is kept, chosen alone and shown, unedited', async () => {
        const saved = defaultKind === 'ASSET' ? recipe : 'ASSET'

        await open({defaultKind, recipe, kind: saved})

        expect(chosen()).toEqual([labelOf(saved, recipe)])
        expect(picker()).toBe(saved === recipe ? 'recipe' : 'asset')
        expect(form.isDirty()).toBe(false)
    })

    it('chosen as the other, shows its picker, an edit its caller is told of', async () => {
        await open({defaultKind, recipe})
        const other = defaultKind === 'ASSET' ? recipe : 'ASSET'

        await act(async () => kindButton(labelOf(other, recipe)).click())

        expect(chosen()).toEqual([labelOf(other, recipe)])
        expect(picker()).toBe(other === recipe ? 'recipe' : 'asset')
        expect(changes).toEqual([other])
        expect(form.isDirty()).toBe(true)
    })
})

const labelOf = (kind, recipe) => kind === recipe ? 'process.sourceType.RECIPE' : 'process.sourceType.ASSET'

const open = async ({defaultKind, recipe, kind}) => {
    changes = []
    const Host = withForm({fields: {kind: new Form.Field()}})(props => {
        form = props.form
        return (
            <SourceKind input={props.inputs.kind} recipe={recipe} defaultKind={defaultKind} onChange={kind => changes.push(kind)}>
                {({recipe, labelButtons}) => <div data-picker={recipe ? 'recipe' : 'asset'}>{labelButtons}</div>}
            </SourceKind>
        )
    })
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}><EventShield><Host values={kind ? {kind} : {}}/></EventShield></Provider>
    ))
}

const picker = () => container.querySelector('[data-picker]')?.dataset.picker

const kindButtons = () => [...container.querySelectorAll('[data-picker] button')]

const kindButton = label => kindButtons().find(button => button.textContent === label)

const chosen = () => kindButtons()
    .filter(button => button.classList.contains(lookStyles.highlight))
    .map(button => button.textContent)
