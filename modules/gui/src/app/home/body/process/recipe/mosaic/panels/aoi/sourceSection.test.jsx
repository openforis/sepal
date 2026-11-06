import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {PortalContainer} from '~/widget/portal'

// The area of interest reads its source itself, so a recipe saved with itself as its own area would be
// resolved from here whatever the selector offers.

const {aoiBounds$, bands$, load$} = vi.hoisted(() => ({aoiBounds$: vi.fn(), bands$: vi.fn(), load$: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {gee: {aoiBounds$, bands$}, recipe: {load$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('./previewMap', () => ({PreviewMap: () => null}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))

const {SourceSection} = await import('./sourceSection')
const {addRecipeType, isImageSource} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: ccdc} = await import('../../../ccdc/ccdc')
const ccdcType = ccdc()
addRecipeType(ccdcType)
addRecipeType({id: 'MOSAIC', imageSource: true})
addRecipeType({id: 'SAMPLING_DESIGN', imageSource: false})

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
    it('offers CCDC as a geometry source, selects its bounds without bands, and still excludes it from image inputs', async () => {
        show({recipeId: null, recipes: [
            {id: OWNER, name: 'This recipe', type: 'MOSAIC'},
            {id: 'ccdc-source', name: 'CCDC source', type: 'CCDC'},
            {id: 'samples', name: 'Samples', type: 'SAMPLING_DESIGN'}
        ]})
        const input = container.querySelector('[data-label="process.mosaic.panel.areaOfInterest.form.source.label"] input')
        await act(async () => input.click())
        const options = [...document.querySelectorAll('[data-hook="option"]')]
        expect(options.map(option => option.textContent)).toContain('CCDC source')
        expect(options.map(option => option.textContent)).not.toContain('This recipe')
        expect(options.map(option => option.textContent)).not.toContain('Samples')
        await act(async () => options.find(option => option.textContent === 'CCDC source').click())
        expect(aoiBounds$).toHaveBeenCalledWith({type: 'RECIPE', id: 'ccdc-source'})
        expect(overlay().featureLayers[0].layerConfig.aoi).toEqual({type: 'RECIPE', id: 'ccdc-source'})
        expect(isImageSource(ccdcType)).toBe(false)
        expect(bands$).not.toHaveBeenCalled()
        expect(load$).not.toHaveBeenCalled()
    })

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

const show = ({recipeId, recipes = []}) => {
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
            recipes,
            folders: [],
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
            <PortalContainer/>
            <EventShield><Recipe id={OWNER}>
                <Host values={{sourceType: 'RECIPE', recipeId}}/>
            </Recipe></EventShield>
        </Provider>
    ))
}
