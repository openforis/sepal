import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'

// The area of interest reads its source itself, so a recipe saved with itself as its own area would be
// resolved from here whatever the selector offers.

const {aoiBounds$, bands$, load$} = vi.hoisted(() => ({aoiBounds$: vi.fn(), bands$: vi.fn(), load$: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {gee: {aoiBounds$, bands$}, recipe: {load$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('./previewMap', () => ({PreviewMap: () => null}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))

const {SourceSection} = await import('./sourceSection')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

beforeEach(() => {
    aoiBounds$.mockReset().mockImplementation(() => of([[0, 0], [1, 1]]))
    bands$.mockReset().mockImplementation(() => of(['red']))
    load$.mockReset().mockImplementation(recipeId => of({id: recipeId, type: 'MOSAIC', model: {}}))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('an area of interest taken from a recipe', () => {
    it('is neither resolved nor overlaid when it is the recipe itself', () => {
        show({recipeId: OWNER})

        expect(aoiBounds$).not.toHaveBeenCalled()
        expect(overlay()).toBeUndefined()
    })

    it('is resolved and overlaid for any other recipe', () => {
        show({recipeId: OTHER})

        expect(aoiBounds$).toHaveBeenCalledWith({type: 'RECIPE', id: OTHER})
        expect(overlay().featureLayers[0].layerConfig.aoi).toEqual({type: 'RECIPE', id: OTHER})
    })
})

const OWNER = 'owner'
const OTHER = 'other'
const AOI_SOURCE_ID = 'aoi-source'

const overlay = () => store.getState().process.loadedRecipes[OWNER].layers.overlay

const fields = {
    sourceType: new Form.Field(),
    assetId: new Form.Field(),
    recipeId: new Form.Field()
}

const Host = withForm({fields})(({inputs}) => <SourceSection inputs={inputs} recipeId={OWNER}/>)

const show = ({recipeId}) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {
                [OWNER]: {
                    id: OWNER,
                    type: 'MOSAIC',
                    model: {},
                    layers: {},
                    ui: {featureLayerSources: [{id: AOI_SOURCE_ID, type: 'Aoi'}]}
                }
            },
            recipes: [],
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={OWNER}>
                <Host values={{sourceType: 'RECIPE', recipeId}}/>
            </Recipe>
        </Provider>
    ))
}
