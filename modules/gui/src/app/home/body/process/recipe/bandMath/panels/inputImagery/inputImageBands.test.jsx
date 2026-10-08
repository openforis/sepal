import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

import bandSpecStyles from './bandSpec.module.css'

// The bands of a Band Math input, as the panel editing it learns its source's, over a real store. What a source is
// found to have is learned, not edited: opening an input edits nothing, and a band its source no longer has stays
// selected, refused until the user replaces or removes it. Only switching to another source reconciles the bands.

const fake = vi.hoisted(() => ({requests: []}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, of, Subject} = await import('rxjs')
    // Answered when a test answers, as Earth Engine answers: later, and not necessarily in order.
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
            assetMetadata$: ({asset}) => request(asset),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            bands$: ({recipe}) => request(recipe.id)
        }
    }}
})
vi.mock('~/app/home/body/process/recipeTypeRegistry', async importOriginal => ({
    ...await importOriginal(),
    getRecipeType: id => ({id, imageSource: true, getPreSetVisualizations: () => []})
}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : `${key}`}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The panel editing one input is open for the input it was activated with, until it closes.
const activation = vi.hoisted(() => ({imageId: null}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: ({id}) => Component => props => {
            const [active, setActive] = useState(true)
            return id === 'inputImage' && active
                ? <Component {...props} activatable={{active, imageId: activation.imageId, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))

const {InputImage} = await import('./inputImage')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'

let root, container, store

beforeEach(() => {
    fake.requests = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

const SOURCES = [
    {
        kind: 'an asset', type: 'ASSET', source: 'users/x/image-x', other: 'users/x/image-y',
        section: 'process.panels.inputImagery.asset.title',
        select: id => selectAsset(id)
    },
    {
        kind: 'a recipe', type: 'RECIPE_REF', source: 'mosaic-1', other: 'mosaic-2',
        section: 'process.panels.inputImagery.recipe.title',
        select: id => selectRecipe(id)
    }
]

describe.each(SOURCES)('a saved input of $kind', ({type, source, other, select}) => {
    const savedInput = includedBands => input({type, id: source, includedBands})

    it('opens and learns its source without offering Apply', async () => {
        const saved = savedInput([band('red')])
        await editInput([saved])
        expect(applyOffered()).toBe(false)

        await answer(source, ['red', 'nir'])

        expect(applyOffered()).toBe(false)
        expect(markedBands()).toEqual([])
        expect(savedImages()).toEqual([saved])
    })

    it('keeps a selected band its source no longer has, marked, without substituting another', async () => {
        const saved = savedInput([band('red')])
        await editInput([saved])

        await answer(source, ['nir'])

        expect(markedBands()).toEqual([['red']])
        expect(bandsInError()).toHaveLength(1)
        expect(applyOffered()).toBe(false)
        expect(savedImages()).toEqual([saved])
    })

    it('marks nothing missing before its source answers, nor when it fails to', async () => {
        await editInput([savedInput([band('red')])])
        expect(markedBands()).toEqual([])

        await fail(source)

        expect(markedBands()).toEqual([])
        expect(applyOffered()).toBe(false)
    })

    it('judges no band missing from the bands it was saved with, only from what its source answers', async () => {
        await editInput([{...savedInput([band('red')]), bands: {nir: {}}}])
        await rename('renamed')
        expect(markedBands()).toEqual([])
        expect(applyEnabled()).toBe(true)

        await answer(source, ['red', 'nir'])

        expect(markedBands()).toEqual([])
        expect(applyEnabled()).toBe(true)
    })

    it('is repaired by replacing the missing band, which keeps its identity', async () => {
        const red = band('red')
        await editInput([savedInput([red])])
        await answer(source, ['nir'])

        await expandBand('red')
        expect(errorsOf(BAND_LABEL)).toEqual([expect.stringContaining(MISSING)])

        await chooseBand('nir')
        expect(markedBands()).toEqual([])
        await apply()

        expect(savedIncludedBands()).toEqual([expect.objectContaining({id: red.id, name: 'nir'})])
    })

    it('is repaired by removing the missing band', async () => {
        const nir = band('nir')
        await editInput([savedInput([band('red'), nir])])
        await answer(source, ['nir'])
        expect(applyEnabled()).toBe(false)

        await removeBand('red')
        await apply()

        expect(savedIncludedBands()).toEqual([nir])
    })

    it('stays refused while a missing band remains, whatever else is edited', async () => {
        await editInput([savedInput([band('red')])])
        await answer(source, ['nir'])

        await rename('renamed')

        expect(applyOffered()).toBe(true)
        expect(applyEnabled()).toBe(false)
    })

    it('is left as committed when a repair is cancelled', async () => {
        const saved = savedInput([band('red')])
        await editInput([saved])
        const model = recipeModel()
        await answer(source, ['nir'])
        await expandBand('red')
        await chooseBand('nir')

        await cancel()

        expect(recipeModel()).toEqual(model)
    })

    it('keeps an edit made while its source loads, which stays to be applied', async () => {
        const red = band('red')
        await editInput([savedInput([red])])
        await rename('renamed')

        await answer(source, ['red', 'nir'])

        expect(applyEnabled()).toBe(true)
        await apply()
        expect(savedImages()).toEqual([expect.objectContaining({name: 'renamed', id: source, includedBands: [red]})])
    })

    it('is not changed by a late answer about the source it was switched from', async () => {
        const nir = band('nir')
        await editInput([savedInput([band('red'), nir])])
        await select(other)
        await answer(other, ['nir', 'swir'])

        await answer(source, ['red', 'nir'])

        expect(applyEnabled()).toBe(true)
        await apply()
        expect(savedImages()).toEqual([expect.objectContaining({id: other, includedBands: [nir]})])
    })

    it('keeps the bands a source switched to has, dropping the others', async () => {
        const nir = band('nir')
        await editInput([savedInput([band('red'), nir])])
        await answer(source, ['red', 'nir'])

        await select(other)
        expect(applyEnabled()).toBe(false)
        await answer(other, ['nir', 'swir'])

        expect(markedBands()).toEqual([])
        await apply()
        expect(savedImages()).toEqual([expect.objectContaining({id: other, includedBands: [nir]})])
    })

    it('can be switched to a source having all its bands, which it keeps', async () => {
        const red = band('red')
        await editInput([savedInput([red])])
        await answer(source, ['red'])

        await select(other)
        await answer(other, ['red', 'nir'])

        await apply()
        expect(savedImages()).toEqual([expect.objectContaining({id: other, includedBands: [red]})])
    })

    it('selects the first band of a source switched to that has none of its bands', async () => {
        await editInput([savedInput([band('red')])])
        await answer(source, ['red'])

        await select(other)
        await answer(other, ['swir', 'nir'])

        await apply()
        expect(savedIncludedBands().map(({name}) => name)).toEqual(['swir'])
    })
})

describe.each(SOURCES)('a new input of $kind', ({source, section, select}) => {
    it('is given a name and the first band of the source it is given', async () => {
        const existing = input({type: 'ASSET', id: 'users/x/existing', includedBands: [band('red')]})
        await editInput([existing], 'input-new')
        await choose(section)

        await select(source)
        await answer(source, ['swir', 'nir'])

        await apply()
        expect(savedImages()[1]).toEqual(expect.objectContaining({
            imageId: 'input-new', name: 'i2', id: source,
            includedBands: [expect.objectContaining({name: 'swir'})]
        }))
    })
})

const MISSING = 'process.bandMath.requirement.missingInputBands'
const BAND_LABEL = 'process.panels.inputImagery.form.band.label'

let bandIds = 0
const band = name => ({id: `band-${++bandIds}`, name, type: 'continuous', legendEntries: []})

const input = ({type, id, includedBands, imageId = 'input-a', name = 'i1'}) => ({
    imageId, name, type, id,
    ...(type === 'ASSET' ? {asset: id} : {recipe: id}),
    bands: Object.fromEntries(includedBands.map(({name}) => [name, {}])),
    includedBands
})

const editInput = async (images, imageId = images[0].imageId) => {
    activation.imageId = imageId
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID, type: 'BAND_MATH', revision: 1, ui: {initialized: true},
                    model: {inputImagery: {images}, calculations: {calculations: []}, outputBands: {outputImages: []}}
                }
            },
            recipes: [
                {id: ID, name: 'Band Math', type: 'BAND_MATH', revision: 1},
                {id: 'mosaic-1', name: 'Mosaic', type: 'MOSAIC', revision: 1},
                {id: 'mosaic-2', name: 'Other mosaic', type: 'MOSAIC', revision: 1}
            ],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {
            user: ['users/x/image-x', 'users/x/image-y', 'users/x/existing'].map(id => ({id, type: 'Image', updateTime: 'T1'})),
            other: []
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
        answer$.next(id.startsWith('users/')
            ? {type: 'Image', bandNames, bands: bandNames.map(id => ({id, data_type: {type: 'PixelType', precision: 'float'}})), properties: {}}
            : bandNames)
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

const choose = label => act(async () => panelButton(label).click())

const selectAsset = async id => {
    const input = field('process.classChange.panel.inputImage.asset.label').querySelector('input')
    await act(async () => input.click())
    await act(async () => setValue(input, id))
    await act(async () => option(id).click())
    await settled()
}

const selectRecipe = async id => {
    const name = selectFrom(store.getState(), 'process.recipes').find(recipe => recipe.id === id).name
    await act(async () => field('widget.recipeInput.label').querySelector('input').click())
    await act(async () => options().find(element => element.textContent === name).click())
    await settled()
}

const expandBand = name => act(async () => bandRow(name).click())

// Another band chosen from what the expanded band's selector offers.
const chooseBand = async name => {
    await act(async () => field(BAND_LABEL).querySelector('input').click())
    await act(async () => option(name).click())
    await settled()
}

// A band row's remove button pressed briefly, as a click.
const removeBand = async name => {
    const button = bandRow(name).querySelector('svg[data-icon="trash"]').closest('button')
    await act(async () => ['mouseenter', 'mousedown', 'mouseup']
        .forEach(type => button.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    await settled()
}

const rename = async name => {
    const input = field('process.bandMath.panel.inputImagery.name.label').querySelector('input')
    await act(async () => setValue(input, name))
    await settled()
}

const apply = async () => {
    await act(async () => panelButton('button.apply').click())
    await settled()
}

const cancel = async () => {
    await act(async () => panelButton('button.cancel').click())
    await settled()
}

const recipeModel = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const savedImages = () => recipeModel().inputImagery.images

const savedIncludedBands = () => savedImages()[0].includedBands

// The bands each marked row says its source no longer has.
const markedBands = () => [...document.querySelectorAll('[data-tooltip]')]
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .filter(text => text.startsWith(MISSING))
    .map(text => JSON.parse(text.slice(MISSING.length)).bands.split(', '))

const bandsInError = () => [...document.querySelectorAll(`.${classOf(bandSpecStyles.error)}`)]

// The row of a selected band: what holds its name and its remove button.
const bandRow = name => {
    let element = [...document.querySelectorAll('div')].find(div => !div.children.length && div.textContent === name)
    while (element && !element.querySelector('svg[data-icon="trash"]')) {
        element = element.parentElement
    }
    return element
}

const classOf = className => {
    expect(className).toEqual(expect.any(String))
    return className
}

const setValue = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

const option = label => options().find(element => element.textContent.includes(label))

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

// An unedited panel offers Close rather than Apply.
const applyOffered = () => !!panelButton('button.apply')

const applyEnabled = () => panelButton('button.apply')?.disabled === false

const settled = () => act(async () => {})
