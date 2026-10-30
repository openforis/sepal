import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import errorIndicatorStyles from '~/widget/errorIndicator.module.css'
import listItemStyles from '~/widget/listItem.module.css'

// The bands of a Band Math input, as the panel editing it learns its source's, over a real store. What a source is
// found to have is learned, not edited: opening an input edits nothing, and a band its source no longer has stays
// selected, refused until the user removes it. Only switching to another source reconciles the bands.

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
// A categorical band's legend, standing in for the legend widget, whose editor needs a panel activation: its entries,
// and an edit as that editor reports one.
vi.mock('~/widget/legend/legend', () => ({
    Legend: ({entries, onUpdate}) =>
        <div data-legend={entries.map(({label}) => label).join(',')}>
            <button type='button' onClick={() => onUpdate([...entries, {id: 'edited', value: 9, label: 'edited', color: '#000000'}])}>
                edit legend
            </button>
        </div>
}))
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
        section: null,
        select: id => selectAsset(id)
    },
    {
        kind: 'a recipe', type: 'RECIPE_REF', source: 'mosaic-1', other: 'mosaic-2',
        section: 'process.sourceType.RECIPE',
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

    it('offers no other band in a band\'s open row, a missing band staying marked', async () => {
        await editInput([savedInput([categorical('red', ['forest'])])])
        await answer(source, ['nir'])

        expect(legendOf('red')).toEqual('forest')
        expect(field(BAND_LABEL)).toBeNull()
        expect(markedBands()).toEqual([['red']])
    })

    it('takes another band by removing the old and adding it, the new band taking nothing of the old', async () => {
        const red = band('red')
        await editInput([savedInput([red])])
        await answer(source, ['nir'])

        await removeBand('red')
        await addBand('nir')
        await apply()

        expect(savedIncludedBands()).toEqual([expect.objectContaining({name: 'nir'})])
        expect(savedIncludedBands()[0].id).not.toEqual(red.id)
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
        await removeBand('red')

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
        expect(addMenuOpen()).toBe(false)
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

    it('selects no band of a source switched to that has none of its bands, until one is added', async () => {
        await editInput([savedInput([band('red')])])
        await answer(source, ['red'])

        await select(other)
        await answer(other, ['swir', 'nir'])
        expect(selectedBands()).toEqual([])
        expect(applyEnabled()).toBe(false)

        await addBand('nir')
        await apply()
        expect(savedIncludedBands().map(({name}) => name)).toEqual(['nir'])
    })
})

describe('an input switched to the other kind of source and back', () => {
    it('keeps a legend its band set aside, through a switch to the other kind and back, out of what is saved', async () => {
        await editInput([input({type: 'RECIPE_REF', id: 'mosaic-1', includedBands: [categorical('class', ['forest'])]})])
        await answer('mosaic-1', ['class'])
        await editLegend('class')
        await chooseType('class', 'continuous')

        await choose('process.sourceType.ASSET')
        await choose('process.sourceType.RECIPE')
        await answer('mosaic-1', ['class'])
        await chooseType('class', 'categorical')

        expect(legendOf('class')).toEqual('forest,edited')
        await apply()
        expect(savedImages()[0]).not.toHaveProperty('setAsideLegends')
        expect(savedIncludedBands()[0].legendEntries.map(({label}) => label)).toEqual(['forest', 'edited'])
    })

    it('keeps each kind\'s own selection, restoring it on return and carrying no band to the other', async () => {
        await editInput([input({type: 'RECIPE_REF', id: 'mosaic-1', includedBands: [band('red'), band('nir')]})])
        await answer('mosaic-1', ['red', 'nir'])

        await choose('process.sourceType.ASSET')
        expect(selectedBands()).toEqual([])
        await selectAsset('users/x/image-x')
        await answer('users/x/image-x', ['swir'])
        expect(selectedBands()).toEqual([])
        await addBand('swir')
        await choose('process.sourceType.ASSET')
        expect(selectedBands()).toEqual(['swir'])

        await choose('process.sourceType.RECIPE')
        await answer('mosaic-1', ['red', 'nir'])
        expect(selectedBands()).toEqual(['red', 'nir'])

        await choose('process.sourceType.ASSET')
        await answer('users/x/image-x', ['swir'])
        expect(selectedBands()).toEqual(['swir'])
        await apply()
        expect(savedImages()).toEqual([expect.objectContaining({type: 'ASSET', id: 'users/x/image-x'})])
        expect(savedIncludedBands().map(({name}) => name)).toEqual(['swir'])
    })

    // Earlier versions recorded an asset input's asset as its recipe too.
    it('offers no recipe for an asset input switched to Recipe, whatever it recorded', async () => {
        await editInput([{...input({type: 'ASSET', id: 'users/x/image-x', includedBands: [band('red')]}), recipe: 'users/x/image-x'}])
        await answer('users/x/image-x', ['red'])

        await choose('process.sourceType.RECIPE')

        expect(fake.requests.map(({id}) => id)).toEqual(['users/x/image-x'])
    })

    it.each([
        ['an asset', 'users/x/image-x', 'ASSET', 'process.sourceType.RECIPE', () => selectRecipe('mosaic-1'), 'mosaic-1', 'process.sourceType.ASSET'],
        ['a recipe', 'mosaic-1', 'RECIPE_REF', 'process.sourceType.ASSET', () => selectAsset('users/x/image-x'), 'users/x/image-x', 'process.sourceType.RECIPE']
    ])('reconciles its bands with %s it returns to, after the other kind\'s source took them', async (_kind, source, type, otherKind, selectOther, other, backKind) => {
        await editInput([input({type, id: source, includedBands: [band('red')]})])
        await answer(source, ['red'])
        await choose(otherKind)
        await selectOther()
        await answer(other, ['nir'])

        await choose(backKind)
        await answer(source, ['red'])

        expect(markedBands()).toEqual([])
        expect(applyEnabled()).toBe(true)
        await apply()
        expect(savedIncludedBands().map(({name}) => name)).toEqual(['red'])
    })
})

describe.each(SOURCES)('a band\'s type, in an input of $kind', ({type, source}) => {
    const savedInput = includedBands => input({type, id: source, includedBands})

    it('is chosen in its row over the source\'s default either way, a categorical band showing its legend', async () => {
        await editInput([savedInput([band('red'), categorical('class', ['forest'])])])
        await answer(source, ['red', 'class'])
        expect(legendOf('red')).toBeNull()
        expect(legendOf('class')).toEqual('forest')

        await chooseType('red', 'categorical')
        await chooseType('class', 'continuous')

        expect(legendOf('red')).toEqual('')
        expect(legendOf('class')).toBeNull()
        await apply()
        expect(savedIncludedBands().map(({name, type}) => [name, type])).toEqual([['red', 'categorical'], ['class', 'continuous']])
    })

    it('shows a legend until its row collapses it, which neither a type click nor an edit reopens', async () => {
        await editInput([savedInput([band('red'), categorical('class', ['forest'])])])
        await answer(source, ['red', 'class'])

        await clickRow('class')
        expect(legendOf('class')).toBeNull()

        await chooseType('class', 'categorical')
        await chooseType('red', 'categorical')
        expect(legendOf('class')).toBeNull()

        await clickRow('class')
        expect(legendOf('class')).toEqual('forest')
    })

    it('opens a collapsed legend once its band is switched to continuous and back', async () => {
        await editInput([savedInput([categorical('class', ['forest'])])])
        await answer(source, ['class'])
        await clickRow('class')

        await chooseType('class', 'continuous')
        await chooseType('class', 'categorical')

        expect(legendOf('class')).toEqual('forest')
    })

    it('keeps an edited legend through a switch to continuous and back, saving none while continuous', async () => {
        const classBand = categorical('class', ['forest'])
        await editInput([savedInput([classBand])])
        await answer(source, ['class'])
        await editLegend('class')

        await chooseType('class', 'continuous')
        await chooseType('class', 'categorical')
        expect(legendOf('class')).toEqual('forest,edited')

        await chooseType('class', 'continuous')
        await apply()
        expect(savedIncludedBands()).toEqual([{id: classBand.id, name: 'class', type: 'continuous', legendEntries: []}])
    })
})

describe.each(SOURCES)('the bands of $kind just selected', ({source, other, section, select}) => {
    const newInput = async () => {
        await editInput([input({type: 'ASSET', id: 'users/x/existing', includedBands: [band('red')]})], 'input-new')
        await choose(section)
    }

    it.each([[['swir', 'nir']], [['swir']]])('are offered once it answers %j with none selected', async bandNames => {
        await newInput()

        await select(source)
        expect(addMenuOpen()).toBe(false)
        await answer(source, bandNames)

        expect(addMenuOpen()).toBe(true)
        expect(bandNames.every(name => option(name))).toBe(true)
        expect(selectedBands()).toEqual([])
    })

    it('stay unoffered once dismissed, through edits leaving none selected', async () => {
        await newInput()
        await select(source)
        await answer(source, ['swir', 'nir'])

        await toggleAddMenu()
        await addBand('swir')
        await toggleAddMenu()
        await removeBand('swir')

        expect(addMenuOpen()).toBe(false)
    })

    it('are not offered again when its kind\'s draft returns, its source read again', async () => {
        await newInput()
        await select(source)
        await answer(source, ['swir', 'nir'])
        await toggleAddMenu()

        await choose(section ? 'process.sourceType.ASSET' : 'process.sourceType.RECIPE')
        await choose(section || 'process.sourceType.ASSET')
        await answer(source, ['swir', 'nir'])

        expect(selectedBands()).toEqual([])
        expect(addMenuOpen()).toBe(false)
    })

    it('are not offered again when it is chosen again after another\'s read failed', async () => {
        await newInput()
        await select(source)
        await answer(source, ['swir', 'nir'])
        await toggleAddMenu()

        await select(other)
        await fail(other)
        await select(source)
        await answer(source, ['swir', 'nir'])

        expect(addMenuOpen()).toBe(false)
    })

    it('are not offered when its read fails, nor when it has no bands', async () => {
        await newInput()

        await select(source)
        await fail(source)
        expect(addMenuOpen()).toBe(false)

        await select(other)
        await answer(other, [])
        expect(addMenuOpen()).toBe(false)
    })
})

describe.each(SOURCES)('a new input of $kind', ({source, section, select}) => {
    it('selects no band of the source it is given until one is added', async () => {
        const existing = input({type: 'ASSET', id: 'users/x/existing', includedBands: [band('red')]})
        await editInput([existing], 'input-new')
        await choose(section)

        await select(source)
        await answer(source, ['swir', 'nir'])
        expect(selectedBands()).toEqual([])
        expect(applyEnabled()).toBe(false)

        await addBand('swir')
        await apply()
        expect(savedImages()[1]).toEqual(expect.objectContaining({
            imageId: 'input-new', name: 'i2', id: source,
            includedBands: [expect.objectContaining({name: 'swir'})]
        }))
    })
})

// Of i1 and i2, i1 was removed: i2 keeps its name.
describe('a new input added once an earlier one is removed', () => {
    it('takes a name no input has, the one left keeping its own', async () => {
        const left = input({type: 'ASSET', id: 'users/x/existing', includedBands: [band('red')], imageId: 'input-b', name: 'i2'})
        await editInput([left], 'input-new')

        await selectAsset('users/x/image-x')
        await answer('users/x/image-x', ['swir'])
        await addBand('swir')
        await apply()

        expect(savedImages().map(({name}) => name)).toEqual(['i2', 'i3'])
    })
})

const MISSING = 'process.bandMath.requirement.missingInputBands'
const BAND_LABEL = 'process.panels.inputImagery.form.band.label'

let bandIds = 0
const band = name => ({id: `band-${++bandIds}`, name, type: 'continuous', legendEntries: []})

// A categorical band whose legend has an entry for each label.
const categorical = (name, labels) => ({
    ...band(name), type: 'categorical',
    legendEntries: labels.map((label, i) => ({id: `${name}-${label}`, value: i + 1, label, color: '#000000'}))
})

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
            folders: [],
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

// The kind of source chosen beside its picker; a new input starts as an asset.
const choose = label => label && act(async () => panelButton(label).click())

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

// A band's row clicked, which shows or hides a categorical band's legend.
const clickRow = name => act(async () => bandRow(name).click())

// A type chosen in a band's row.
const chooseType = (name, type) => act(async () => [...bandItem(name).querySelectorAll('button')]
    .find(button => button.textContent === `process.panels.inputImagery.form.type.${type}`).click())

// A band's legend edited, as its editor reports an edit.
const editLegend = name => act(async () => [...bandItem(name).querySelectorAll('button')]
    .find(button => button.textContent === 'edit legend').click())

// A band added from the bands offered, the "+" opening them where they are not offered already.
const addBand = async name => {
    if (!addMenuOpen()) {
        await toggleAddMenu()
    }
    await act(async () => option(name).click())
    await settled()
}

// The "+" pressed, which opens or closes the bands offered.
const toggleAddMenu = async () => {
    await act(async () => document.querySelector('svg[data-icon="plus"]').closest('button').click())
    await settled()
}

const addMenuOpen = () =>
    !!document.querySelector('input[placeholder="process.classification.panel.inputImagery.bandSetSpec.addBands.placeholder"]')

// Another band chosen from what the expanded band's selector offers.

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

// The band rows marked in error.
const bandsInError = () => [...document.querySelectorAll(`.${classOf(errorIndicatorStyles.indicator)}`)]
    .map(indicator => indicator.closest(`.${classOf(listItemStyles.verticalWrapper)}`))

// The row of a selected band: what holds its name and its remove button.
const bandRow = name => {
    let element = [...document.querySelectorAll('div')].find(div => !div.children.length && div.textContent === name)
    while (element && !element.querySelector('svg[data-icon="trash"]')) {
        element = element.parentElement
    }
    return element
}

// The bands selected, by name, in the order their rows show them.
const selectedBands = () => ['red', 'nir', 'swir', 'class']
    .filter(name => bandRow(name))
    .sort((a, b) => bandRow(a).compareDocumentPosition(bandRow(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)

// A band's whole item: its row and any legend it shows.
const bandItem = name => bandRow(name).closest(`.${classOf(listItemStyles.verticalWrapper)}`)

// The labels of the legend a band shows, or null where it shows none.
const legendOf = name => bandItem(name).querySelector('[data-legend]')?.dataset.legend ?? null

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

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

// An unedited panel offers Close rather than Apply.
const applyOffered = () => !!panelButton('button.apply')

const applyEnabled = () => panelButton('button.apply')?.disabled === false

const settled = () => act(async () => {})
