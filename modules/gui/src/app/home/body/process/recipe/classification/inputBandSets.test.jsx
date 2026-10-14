import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import errorIndicatorStyles from '~/widget/errorIndicator.module.css'
import listItemStyles from '~/widget/listItem.module.css'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// A Classification's input images whose band sets select what their sources do not provide, through its real input
// list, input editor and Input imagery button over the real source runtime and store. Earth Engine answers each asset's
// bands when a test answers. What one input's source establishes marks that input, its section and holds Retrieve,
// whatever another still awaits; one input is repaired in its editor, judged alone, while another stays wrong.

const fake = vi.hoisted(() => ({requests: []}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, of, Subject} = await import('rxjs')
    return {default: {
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of([{id: 'classification-1', name: 'Land cover', type: 'CLASSIFICATION', revision: 1}])},
        gee: {
            // An asset's bands, answered when a test answers; its picker's metadata, at once.
            bands$: ({asset}) => {
                const answer$ = new Subject()
                fake.requests.push({asset, answer$})
                return answer$
            },
            assetMetadata$: ({asset}) => of({type: 'Image', bandNames: BANDS[asset], bands: BANDS[asset].map(id => ({id})), properties: {}}),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => {
    const name = Array.isArray(key) ? key.join('.') : key
    return values ? `${name} ${JSON.stringify(values)}` : name
}}))
vi.mock('~/user', () => ({isServiceAccount: () => false}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The input list is open; an input's editor opens for the input chosen in it, until it closes.
const editor = vi.hoisted(() => ({open: () => {}}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useEffect, useState} = await import('react')
    return {
        withActivatable: ({id}) => Component => props => {
            const [imageId, setImageId] = useState(null)
            useEffect(() => {
                if (id === 'inputImage') {
                    editor.open = setImageId
                }
            }, [])
            if (id === 'inputImage') {
                return imageId
                    ? <Component {...props} activatable={{active: true, imageId, activate: () => {}, deactivate: () => setImageId(null)}}/>
                    : null
            }
            return <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        }
    }
})
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props =>
        <Component {...props} activator={{activatables: {
            inputImage: {activate: ({imageId}) => editor.open(imageId)},
            button: {active: false, canActivate: true, toggle: () => {}}
        }}}/>
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classification} = await import('./classification')
const {Recipe} = await import('~/app/home/body/process/recipeContext')
const {SourceRuntimeProvider, withSourceRuntime} = await import('~/app/home/body/process/sourceRuntime/sourceRuntimeContext')
const {InputImagery} = await import('~/app/home/body/process/panels/inputImageryWithDerived/inputImagery')
const {SectionButton} = await import('../sectionButton')
const {retrieveAvailability} = await import('../operationAvailability')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {Toolbar} = await import('~/widget/toolbar/toolbar')

addRecipeType(classification())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    fake.requests = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Classification with an input whose source lacks a selected band', () => {
    it('is marked on that input and Input imagery, holding Retrieve, while another input is still read and judged', async () => {
        await open([image('image-a', MOSAIC, ['elevation']), image('image-b', ASSET_B, ['swir1'])], [MOSAIC])
        expect(markedInputs()).toEqual({Covariates: [INPUT]})
        expect(sectionMark()).toEqual([SECTION])
        expect(retrieveAvailable()).toBe(false)
        expect(requested()).toEqual([ASSET_B])

        await answer(ASSET_B, ['red'])

        expect(markedInputs()).toEqual({Covariates: [INPUT], [ASSET_B]: [INPUT]})
        expect(retrieveAvailable()).toBe(false)
    })

    it('stays marked, holding Retrieve, once another input fails to be read', async () => {
        await open([image('image-a', ASSET_A, ['red', 'nir']), image('image-b', ASSET_B, ['swir1'])])
        await answer(ASSET_A, ['nir'])

        await fail(ASSET_B)

        expect(markedInputs()).toEqual({[ASSET_A]: [INPUT]})
        expect(sectionMark()).toEqual([SECTION])
        expect(retrieveAvailable()).toBe(false)
    })

    it('is repaired in its editor and applied, while another input stays wrong', async () => {
        await open([image('image-a', ASSET_A, ['red', 'nir']), image('image-b', ASSET_B, ['swir1'])])
        await answer(ASSET_A, ['nir'])
        await answer(ASSET_B, ['red'])
        expect(Object.keys(markedInputs())).toEqual([ASSET_A, ASSET_B])
        await edit(ASSET_A)
        expect(markedSelections()).toEqual([['red', missing('red')]])

        await removeSelection('red')
        expect(applyEnabled()).toBe(true)
        await apply()

        expect(savedImage('image-a').bandSetSpecs[0].included).toEqual(['nir'])
        expect(markedInputs()).toEqual({[ASSET_B]: [INPUT]})
        expect(sectionMark()).toEqual([SECTION])
        expect(retrieveAvailable()).toBe(false)
    })
})

describe('a band its source no longer provides, selected in Image bands and a Ratio', () => {
    it('is summarized on the input and Input imagery, and said beside each selection and band set in its editor', async () => {
        const ratio = {id: 'ratio', type: 'PAIR_WISE_EXPRESSION', operation: 'RATIO', included: ['ratio_VV_VH', 'VV']}
        await open([image('image-a', ASSET_A, ['ratio_VV_VH', 'VV'], [ratio])])
        await answer(ASSET_A, ['VV', 'VH'])
        expect(markedInputs()).toEqual({[ASSET_A]: [INPUT]})
        expect(sectionMark()).toEqual([SECTION])

        await edit(ASSET_A)

        expect(rowProblems()).toEqual([[missing('ratio_VV_VH')], [missing('ratio_VV_VH'), INSUFFICIENT]])
        expect(markedSelections()).toEqual([['ratio_VV_VH', missing('ratio_VV_VH')], ['ratio_VV_VH', missing('ratio_VV_VH')]])
    })
})

// An editor judges the input it edits: what keeps the applied recipe from running elsewhere neither holds its Apply nor
// changes because of it.
describe('a Classification without training data', () => {
    it('applies an input repaired in its editor, and still cannot run', async () => {
        await open([image('image-a', ASSET_A, ['red', 'nir'])], [], {trainingData: {dataSets: []}})
        await answer(ASSET_A, ['nir'])
        await edit(ASSET_A)
        expect(markedSelections()).toEqual([['red', missing('red')]])

        await removeSelection('red')
        expect(applyEnabled()).toBe(true)
        await apply()

        expect(savedImage('image-a').bandSetSpecs[0].included).toEqual(['nir'])
        expect(markedInputs()).toEqual({})
        expect(retrieveAvailable()).toBe(false)
    })
})

describe('a band combination given its first band in its editor', () => {
    it('is told it needs another once its Add popup closes, Apply held meanwhile and the applied recipe unaffected', async () => {
        await open([image('image-a', ASSET_A, ['red', 'nir'])])
        await answer(ASSET_A, ['red', 'nir', 'swir1'])
        await edit(ASSET_A)
        await addDerived('RATIO')

        await addBand('swir1', 1)
        expect(rowProblems()[1]).toEqual([])
        expect(applyEnabled()).toBe(false)
        expect(retrieveAvailable()).toBe(true)
        await togglePopup(1)

        expect(rowProblems()[1]).toEqual([INSUFFICIENT])
    })
})

const TRAINED = {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 0.5, y: 0.5, class: 1}]}]}

const ID = 'classification-1'
const ASSET_A = 'users/x/covariates-a'
const ASSET_B = 'users/x/covariates-b'
// An optical mosaic, described from its configuration as soon as it is loaded.
const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    revision: 1,
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const BANDS = {[ASSET_A]: ['red', 'nir', 'swir1'], [ASSET_B]: ['red', 'swir1']}
const INSUFFICIENT = 'process.classification.panel.inputImagery.bandSetSpec.insufficientBands'

const INPUT = 'process.classification.panel.inputImagery.unavailableSelections.input'
const SECTION = 'process.classification.panel.inputImagery.unavailableSelections.inputs'
const missing = band => `process.classification.panel.inputImagery.bandSetSpec.unavailableBands ${JSON.stringify({bands: `“${band}”`})}`

const image = (imageId, source, included, otherSets = []) => ({
    imageId,
    ...(source === MOSAIC ? {type: 'RECIPE_REF', id: MOSAIC.id} : {type: 'ASSET', id: source, bands: BANDS[source]}),
    bandSetSpecs: [{id: `${imageId}-bands`, type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included}, ...otherSets]
})

// Trained on a collected point, unless a test says otherwise.
const open = async (images, recipes = [], {trainingData = TRAINED} = {}) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID, type: 'CLASSIFICATION', revision: 1, ui: {initialized: true},
                    model: {
                        inputImagery: {images},
                        legend: {entries: [{id: 'entry-1', value: 1, label: 'Forest', color: '#000000'}]},
                        trainingData,
                        classifier: {type: 'RANDOM_FOREST'}
                    }
                },
                ...Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))
            },
            recipes: [{id: ID, name: 'Land cover', type: 'CLASSIFICATION', revision: 1}, {id: MOSAIC.id, name: 'Covariates', type: 'MOSAIC', revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {user: [ASSET_A, ASSET_B].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ID}>
                    <RuntimeProbe/>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <Toolbar vertical placement='bottom-right'>
                                <SectionButton
                                    id='inputImagery'
                                    label='process.classification.panel.inputImagery.button'
                                    tooltip='process.classification.panel.inputImagery.tooltip'/>
                            </Toolbar>
                            <InputImagery/>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// The pending reads of an asset's bands answered with those it has.
const answer = async (asset, names) => {
    await act(async () => fake.requests.filter(request => request.asset === asset).forEach(({answer$}) => {
        answer$.next(names.map(name => ({name, arrayDimensions: 0})))
        answer$.complete()
    }))
    await settled()
}

const fail = async asset => {
    await act(async () => fake.requests.filter(request => request.asset === asset)
        .forEach(({answer$}) => answer$.error(new Error('Earth Engine unreachable'))))
    await settled()
}

const requested = () => [...new Set(fake.requests.map(({asset}) => asset))]

const edit = async asset => {
    await click(inputRows().find(row => row.textContent.includes(asset)))
}

const apply = () => click(button('button.apply'))

const applyEnabled = () => button('button.apply')?.disabled === false

const addDerived = async operation => {
    await click(button('process.classification.panel.inputImagery.derivedBands.label'))
    await click(options().find(element =>
        element.textContent === `process.classification.panel.inputImagery.derivedBands.bandCombinations.options.${operation}.label`))
}

// A band added to a band set, by its place, from what its "+" offers.
const addBand = async (name, set) => {
    if (!options().length) {
        await togglePopup(set)
    }
    await click(options().find(element => element.textContent === name))
}

const togglePopup = set => click(bandSetRows()[set].querySelector('svg[data-icon="plus"]').closest('button'))

const removeSelection = name => click(selectionsIn(document).find(button => button.textContent === name))

const retrieveAvailable = () => retrieveAvailability({
    state: store.getState(),
    recipe: selectFrom(store.getState(), ['process.loadedRecipes', ID]),
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id),
    heldFor: key => runtime.heldFor(key),
    now: Date.now()
}).available

const savedImage = imageId => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model', 'inputImagery', 'images'])
    .find(image => image.imageId === imageId)

// The inputs of the list marked in error, by the asset each shows, with what their mark explains.
const markedInputs = () => Object.fromEntries(inputRows()
    .map(row => [assetOf(row), markOf(row)])
    .filter(([, mark]) => mark.length))

const inputRows = () => [...document.querySelectorAll(`.${listItemStyles.verticalWrapper}`)]
    .filter(row => assetOf(row))

// What an input's row shows it is read from: an asset's id, or a recipe's name.
const assetOf = row => [ASSET_A, ASSET_B, 'Covariates'].find(asset => row.textContent.includes(asset) && !row.textContent.includes('bandSetSpec'))

// What the Input imagery button says, while it is in its error state.
const sectionMark = () => {
    const sectionButton = button('process.classification.panel.inputImagery.button')
    return sectionButton.classList.contains(toolbarButtonStyles.error)
        ? JSON.parse(sectionButton.closest('[data-tooltip]').dataset.tooltip)
        : []
}

// What each band set of the open editor says is wrong with it.
const rowProblems = () => bandSetRows().map(markOf)

const bandSetRows = () => [...document.querySelectorAll(`.${listItemStyles.verticalWrapper}`)]
    .filter(row => row.textContent.includes('bandSetSpec'))

// The selections of the open editor marked as ones their source does not provide, each with what it says.
const markedSelections = () => selectionsIn(document)
    .filter(button => button.closest('[data-tooltip]'))
    .map(button => [button.textContent, ...JSON.parse(button.closest('[data-tooltip]').dataset.tooltip)])

const selectionsIn = element => [...element.querySelectorAll('button')]
    .filter(button => button.querySelector('svg[data-icon="xmark"]'))

const markOf = row => {
    const tooltip = row.querySelector(`.${errorIndicatorStyles.indicator} [data-tooltip]`)
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

async function click(element) {
    expect(element).toBeDefined()
    await act(async () => element.click())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
