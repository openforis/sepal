import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {PortalContainer} from '~/widget/portal'

// Which breakpoint bands the CCDC sources panel offers, and where the classifier-derived ones come from.
//
// They are offered in the simple view, while the classification that produces them is selected under More.
// So opening the panel on a saved classification has to read it, whichever view is showing.
//
// The panel body and the real band vocabulary are rendered; the panel chrome and the recipe read are the
// substitutes.

vi.mock('~/translate', () => ({
    msg: (key, args) => [key, ...(args ? Object.values(args) : [])].join(' ')
}))
vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children}) => <div>{children}</div>,
    recipeFormPanel: () => Component => Component
}))
// Reading recipes is what this substitutes; the form and the band vocabulary are real. Anything that reads
// without being handed a reader is recorded, so a read nobody asked for is visible.
vi.mock('~/app/home/body/process/recipeAccess', () => ({
    recipeAccess: () => Component => props => (
        <Component
            usingRecipe={() => {}}
            loadedRecipes={{}}
            reloadRecipe$={recipeId => recipeRead(recipeId)}
            loadRecipe$={recipeId => recipeRead(recipeId)}
            {...props}
        />
    )
}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side. Nothing here renders one.
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// Panel chrome, not the controls under test. Every form control stays real.
vi.mock('~/widget/form', async importOriginal => {
    const {Form} = await importOriginal()
    return {Form: {...Form, PanelButtons: ({children}) => <div>{children}</div>}}
})

const {Sources} = await import('./sources')

const recipeRead = recipeId => {
    read.push(recipeId)
    return load$(recipeId)
}

const RECIPE = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const REGRESSION = 'process.classification.bands.regression'
const PROBABILITY = 'process.classification.bands.probability Forest'
// A band the data set itself supplies, so an empty option list cannot pass for a withdrawn classifier.
const ORDINARY_BAND = 'blue'

describe('the breakpoint bands a saved classification contributes', () => {
    it('are offered in the simple view, before the classification selector is shown', async () => {
        await open({classification: CLASSIFICATION})

        expect(offeredBands()).toEqual(expect.arrayContaining([REGRESSION, PROBABILITY]))
        // One read, the panel's own - nothing was cached for it, and the selector is not even rendered.
        expect(read).toEqual([CLASSIFICATION])
    })

    it('are not offered when no classification was saved, while the ordinary bands are', async () => {
        await open({})

        expect(offeredBands()).not.toContain(REGRESSION)
        expect(offeredBands()).not.toContain(PROBABILITY)
        expect(offeredBands()).toContain(ORDINARY_BAND)
    })

    it('are withdrawn when the classification is cleared', async () => {
        await open({classification: CLASSIFICATION, advanced: true})
        expect(offeredBands()).toEqual(expect.arrayContaining([REGRESSION, PROBABILITY]))

        await clearClassification()

        expect(offeredBands()).not.toContain(REGRESSION)
        expect(offeredBands()).not.toContain(PROBABILITY)
        expect(offeredBands()).toContain(ORDINARY_BAND)
    })

    it('are not restored by a read that was still in flight when it was cleared', async () => {
        const held = new Subject()
        await open({classification: CLASSIFICATION, advanced: true}, {load$: () => held})

        await clearClassification()
        await act(async () => {
            held.next(classificationRecipe())
            held.complete()
        })

        expect(offeredBands()).not.toContain(REGRESSION)
        expect(offeredBands()).not.toContain(PROBABILITY)
    })
})

const offeredBands = () => [...document.querySelectorAll('button')]
    .map(button => button.textContent)
    .filter(label => label)

// The control the user clicks to clear a selection, found by the icon that names it.
const clearClassification = () => act(async () => {
    const clearButton = document.querySelector('[data-icon="xmark"]')?.closest('button')
    expect(clearButton, 'the selector offers no way to clear').toBeDefined()
    clearButton.click()
})

const classificationRecipe = () => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {legend: {entries: [{value: 1, label: 'Forest'}]}, classifier: {type: 'RANDOM_FOREST'}}
})

let root, container, store, read, load$

const fields = {
    advanced: new Form.Field(),
    dataSetType: new Form.Field(),
    dataSets: new Form.Field(),
    asset: new Form.Field(),
    validAsset: new Form.Field(),
    cloudPercentageThreshold: new Form.Field(),
    classification: new Form.Field(),
    breakpointBands: new Form.Field()
}

beforeEach(() => {
    read = []
    load$ = () => of(classificationRecipe())
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

// A cold cache: nothing is loaded, so the panel's own read is what reaches the record.
const open = ({classification, advanced}, {load$: reads} = {}) => {
    if (reads) {
        load$ = reads
    }
    const Host = withForm({fields})(({inputs}) => (
        <Sources
            recipeId={RECIPE}
            inputs={inputs}
            corrections={['SR']}
            loadRecipe$={recipeRead}
            stream={(_name, stream$, onNext, onError) => stream$
                ? stream$.subscribe({next: onNext, error: onError})
                : {active: false}}
        />
    ))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {[RECIPE]: {id: RECIPE, type: 'CCDC', model: {}}},
            recipes: [{id: CLASSIFICATION, name: 'A classification', type: 'CLASSIFICATION'}],
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState) => state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <EventShield>
                <Recipe id={RECIPE}>
                    <Host values={{
                        advanced,
                        dataSetType: 'OPTICAL',
                        dataSets: ['LANDSAT_8'],
                        cloudPercentageThreshold: 100,
                        classification,
                        breakpointBands: []
                    }}/>
                </Recipe>
            </EventShield>
        </Provider>
    ))
}
