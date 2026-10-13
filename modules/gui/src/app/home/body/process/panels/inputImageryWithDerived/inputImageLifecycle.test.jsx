import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import listItemStyles from '~/widget/listItem.module.css'

// A saved input of Classification, Regression or Unsupervised Classification, as the editor they share learns its
// source's bands over a real store: its band sets - image bands, and an index derived from them - are the user's, kept
// while its own source is read, and reconciled only with another source deliberately chosen. Each kind of source keeps
// its own band sets while the editor is open. Earth Engine answers when a test answers, and not necessarily in order.
// Whether a selection is one its source provides is judged through the recipe's output read
// (recipe/classification/inputBandSets.test.jsx).

const fake = vi.hoisted(() => ({requests: []}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, of, Subject} = await import('rxjs')
    const request = id => {
        const answer$ = new Subject()
        fake.requests.push({id, answer$})
        return answer$
    }
    return {default: {
        recipe: {
            save$: () => NEVER,
            load$: id => of({id, type: 'MOSAIC', revision: 1, model: {}}),
            loadAll$: () => NEVER
        },
        gee: {
            bands$: ({recipe}) => request(recipe.id),
            assetMetadata$: ({asset}) => request(asset),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
        }
    }}
})
vi.mock('~/app/home/body/process/recipeTypeRegistry', async importOriginal => ({
    ...await importOriginal(),
    getRecipeType: id => ({id, imageSource: true, getPreSetVisualizations: () => []})
}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : `${key}`}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))
// The panel editing one input is open for the input it was activated with, until it closes.
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: ({id}) => Component => props => {
            const [active, setActive] = useState(true)
            return id === 'inputImage' && active
                ? <Component {...props} activatable={{active, imageId: 'input-a', activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})

const {InputImage} = await import('./inputImage')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'classification-1'

let root, container, store

beforeEach(() => {
    fake.requests = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a saved input opened', () => {
    it('edits nothing, and offers what its source has now once it answers', async () => {
        await editInput()

        await answer('mosaic-1', ['red', 'nir', 'swir1'])

        expect(applyOffered()).toBe(false)
        expect(bandSets()).toEqual([['red', 'nir'], ['ndvi']])
        expect(await bandsOffered()).toEqual(['swir1'])
        expect(savedImage()).toEqual(SAVED)
    })

    it('keeps its band sets while its source has not answered, or failed to', async () => {
        await editInput()

        await fail('mosaic-1')

        expect(bandSets()).toEqual([['red', 'nir'], ['ndvi']])
        expect(applyOffered()).toBe(false)
    })

    it('keeps its selections shown, to be removed, when its source answers it has no bands', async () => {
        await editInput()
        await answer('mosaic-1', [])

        await removeSelection('red')

        expect(bandSets()).toEqual([['nir'], ['ndvi']])
    })

    it('keeps every band set, even one its source no longer fills, when edited before its source answers', async () => {
        await editInput()
        await addDerived('RATIO')

        await answer('mosaic-1', ['nir'])

        expect(bandSets()).toEqual([['red', 'nir'], ['ndvi'], []])
    })

    it('is left as saved when its edit is cancelled', async () => {
        await editInput()
        await answer('mosaic-1', ['nir', 'swir1'])
        await addDerived('RATIO')

        await cancel()

        expect(savedImage()).toEqual(SAVED)
    })
})

describe('a saved input switched to another source', () => {
    it('keeps what the new source still has, image bands and derived alike', async () => {
        await editInput()
        await answer('mosaic-1', ['red', 'nir'])

        await selectRecipe('mosaic-2')
        await answer('mosaic-2', ['nir', 'swir1'])
        await apply()

        expect(savedImage()).toMatchObject({id: 'mosaic-2', bands: ['nir', 'swir1']})
        expect(savedImage().bandSetSpecs.map(({included}) => included)).toEqual([['nir']])
    })

    it('shows its band sets again once switched back, though its source then fails to answer', async () => {
        await editInput()
        await selectRecipe('mosaic-2')

        await selectRecipe('mosaic-1')
        await fail('mosaic-1')

        expect(bandSets()).toEqual([['red', 'nir'], ['ndvi']])
    })

    it('shows its band sets again once switched back, though its source then fails to answer, as an asset', async () => {
        await editInput(SAVED_ASSET)
        await selectAsset(OTHER_ASSET)

        await selectAsset(SAVED_ASSET.id)
        await fail(SAVED_ASSET.id)

        expect(bandSets()).toEqual([['red', 'nir'], ['ndvi']])
    })

    it('ignores an answer about the source it had before', async () => {
        await editInput()
        await selectRecipe('mosaic-2')
        await answer('mosaic-2', ['red', 'nir', 'swir1'])

        await answer('mosaic-1', ['blue'])
        await apply()

        expect(savedImage()).toMatchObject({id: 'mosaic-2', bands: ['red', 'nir', 'swir1']})
        expect(savedImage().bandSetSpecs.map(({included}) => included)).toEqual([['red', 'nir'], ['ndvi']])
    })
})

describe('a saved input switched between kinds of source', () => {
    it('keeps each kind\'s band sets, derived ones included, applying only the kind shown', async () => {
        await editInput(SAVED_ASSET)
        await answerAsset(SAVED_ASSET.id, ['red', 'nir'])

        await chooseKind('RECIPE')
        expect(bandSets()).toEqual([])
        await selectRecipe('mosaic-2')
        await answer('mosaic-2', ['swir1', 'swir2'])
        await addBand('swir1')
        await addDerived('RATIO')
        await chooseKind('ASSET')
        expect(bandSets()).toEqual([['red', 'nir'], ['ndvi']])
        await chooseKind('RECIPE')
        expect(bandSets()).toEqual([['swir1'], []])
        await apply()

        expect(savedImage()).toMatchObject({type: 'RECIPE_REF', id: 'mosaic-2', bands: ['swir1', 'swir2']})
        expect(savedImage().bandSetSpecs.map(({type, included}) => [type, included]))
            .toEqual([['IMAGE_BANDS', ['swir1']], ['PAIR_WISE_EXPRESSION', []]])
    })

    it('is left as saved when cancelled after switching', async () => {
        await editInput(SAVED_ASSET)
        await chooseKind('RECIPE')
        await selectRecipe('mosaic-2')
        await answer('mosaic-2', ['swir1'])

        await cancel()

        expect(savedImage()).toEqual(SAVED_ASSET)
    })

    it('is not told what the source of the kind it left answers late', async () => {
        await editInput(SAVED_ASSET)
        await chooseKind('RECIPE')

        await answerAsset(SAVED_ASSET.id, ['red', 'nir'])

        expect(button('process.classification.panel.inputImagery.derivedBands.label').disabled).toBe(true)
    })
})

// Saved with two image bands and an index derived from them.
const SAVED = {
    imageId: 'input-a',
    type: 'RECIPE_REF',
    id: 'mosaic-1',
    bands: ['red', 'nir'],
    bandSetSpecs: [
        {id: 'set-1', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']},
        {id: 'set-2', type: 'INDEXES', included: ['ndvi']}
    ]
}

// The same input, saved with an asset as its source.
const SAVED_ASSET = {...SAVED, type: 'ASSET', id: 'users/x/image-a'}
const OTHER_ASSET = 'users/x/image-b'

const editInput = async (saved = SAVED) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {id: ID, type: 'CLASSIFICATION', revision: 1, ui: {initialized: true}, model: {inputImagery: {images: [saved]}}}
            },
            recipes: [
                {id: ID, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
                {id: 'mosaic-1', name: 'Mosaic', type: 'MOSAIC', revision: 1},
                {id: 'mosaic-2', name: 'Other mosaic', type: 'MOSAIC', revision: 1}
            ],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {user: [SAVED_ASSET.id, OTHER_ASSET].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
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
                        <InputImage/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </Provider>
    ))
    await settled()
}

// The pending request about a source answered with the bands it has.
const answer = async (id, bandNames) => {
    const {answer$} = pending(id)
    await act(async () => {
        answer$.next(bandNames)
        answer$.complete()
    })
    await settled()
}

// The pending read of an asset answered with the bands it has.
const answerAsset = async (id, bandNames) => {
    const {answer$} = pending(id)
    await act(async () => {
        answer$.next({type: 'Image', bandNames, bands: bandNames.map(name => ({id: name})), properties: {}})
        answer$.complete()
    })
    await settled()
}

const fail = async id => {
    const {answer$} = pending(id)
    await act(async () => answer$.error(new Error('unavailable')))
    await settled()
}

const pending = id => {
    const request = fake.requests.filter(request => request.id === id).at(-1)
    expect(request).toBeDefined()
    return request
}

const selectRecipe = async id => {
    const name = selectFrom(store.getState(), 'process.recipes').find(recipe => recipe.id === id).name
    await click(document.querySelector('[data-label="widget.recipeInput.label"] input'))
    await click(options().find(element => element.textContent === name))
}

// The kind of source chosen beside the picker.
const chooseKind = kind => click(button(`process.sourceType.${kind}`))

const selectAsset = async id => {
    const input = document.querySelector('[data-label="process.classification.panel.inputImagery.form.asset.label"] input')
    await click(input)
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, id)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await click(options().find(element => element.textContent.includes(id)))
}

// A selection removed from the band set showing it.
const removeSelection = name => click([...document.querySelectorAll('button')]
    .find(button => button.textContent === name && button.querySelector('svg[data-icon="xmark"]')))

// A band added to a band set - the image bands set unless another is named by its place - from what its "+" offers.
const addBand = async (name, set = 0) => {
    if (!options().length) {
        await click(bandSetRows()[set].querySelector('svg[data-icon="plus"]').closest('button'))
    }
    await click(options().find(element => element.textContent === name))
}

// A derived band set added from the derived bands offered.
const addDerived = async operation => {
    await click(button('process.classification.panel.inputImagery.derivedBands.label'))
    await click(options().find(element =>
        element.textContent === `process.classification.panel.inputImagery.derivedBands.bandCombinations.options.${operation}.label`))
}

// The bands offered to the image bands set, its "+" opened and closed again.
const bandsOffered = async () => {
    const plus = () => document.querySelector('svg[data-icon="plus"]').closest('button')
    await click(plus())
    const offered = options().map(element => element.textContent)
        .filter(text => !text.startsWith('process.'))
    await click(plus())
    return offered
}

const apply = () => click(button('button.apply'))

const cancel = () => click(button('button.cancel'))

const applyOffered = () => !!button('button.apply') && !button('button.apply').disabled

// What each band set shown selects, in order.
const bandSets = () => bandSetRows()
    .map(row => selectionsIn(row).map(button => button.textContent))

const bandSetRows = () => [...document.querySelectorAll(`.${listItemStyles.verticalWrapper}`)]
    .filter(item => item.textContent.includes('bandSetSpec'))

const selectionsIn = row => [...row.querySelectorAll('button')]
    .filter(button => button.querySelector('svg[data-icon="xmark"]'))

const savedImage = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model', 'inputImagery', 'images'])[0]

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
