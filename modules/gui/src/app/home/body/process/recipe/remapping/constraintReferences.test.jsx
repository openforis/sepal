import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import listItemStyles from '~/widget/listItem.module.css'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// Remapping constraints reading an input since removed, or a band their input no longer includes, as the editor's real
// toolbar, Mapping panel and constraint modal show them over a real store: marked on the Mapping button, the legend
// entry's row and the constraint's field, Retrieve not offered, never rewritten until repaired and applied. An edit not
// yet applied is judged by the modal alone. Index Change, sharing the constraint editor without asking it to check
// references, judges its constraints as before. Earth Engine never answers.

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => NEVER,
        assetMetadata$: () => NEVER,
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of([])}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: remapping} = await import('./remapping')
const {RemappingToolbar} = await import('./panels/remappingToolbar')
const {default: indexChange} = await import('../indexChange/indexChange')
const {defaultModel: indexChangeModel} = await import('../indexChange/indexChangeRecipe')
const {IndexChangeToolbar} = await import('../indexChange/panels/indexChangeToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(remapping())
addRecipeType(indexChange())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a mapping whose constraints read an input since removed and a band no longer included', () => {
    it('is marked on the Mapping button and the entry\'s row, and opening it writes nothing', async () => {
        const saved = remappingRecipe()
        await open(saved, <RemappingToolbar/>)

        expect(inError(MAPPING)).toBe(true)
        expect(buttonTooltip(MAPPING)).toContain(MISSING_INPUT)
        expect(retrieveOffered()).toBe(false)

        await press(MAPPING)
        expect(rowsInError()).toEqual(['Forest'])

        await openEntry('Forest')
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(saved.model)
    })

    it('lets each invalid constraint be expanded in turn, its field saying what is wrong', async () => {
        await openForest()

        await expand(REMOVED_INPUT.description)
        expect(errorsOf(IMAGE)).toEqual([expect.stringContaining('widget.imageConstraints.image.notOffered')])

        await expand(NOT_INCLUDED.description)
        expect(errorsOf(BAND)).toEqual([expect.stringContaining('widget.imageConstraints.band.notOffered')])
        expect(field(IMAGE)).toBeNull()
    })

    it('marks only its invalid constraints while collapsed, each saying why, its fields saying it while expanded', async () => {
        const valid = constraintOf('c-4', 'i-1', 'class', '>', 5)
        await openForest(remappingRecipe([REMOVED_INPUT, NOT_INCLUDED, valid]))

        expect(constraintsMarked()).toEqual([true, true, false])
        expect(summaryTooltips()).toEqual([[IMAGE_NOT_OFFERED], [BAND_NOT_OFFERED], []])

        await expand(NOT_INCLUDED.description)
        expect(constraintsMarked()).toEqual([true, false, false])
        expect(summaryTooltips()).toEqual([[IMAGE_NOT_OFFERED], [], []])
        expect(errorsOf(BAND)).toEqual([BAND_NOT_OFFERED])

        await clickConstraint(1)
        expect(constraintsMarked()).toEqual([true, false, false])
        expect(errorsOf(BAND)).toEqual([BAND_NOT_OFFERED])

        await expand(REMOVED_INPUT.description)
        expect(constraintsMarked()).toEqual([false, true, false])
        expect(summaryTooltips()).toEqual([[], [BAND_NOT_OFFERED], []])
        expect(errorsOf(IMAGE)).toEqual([IMAGE_NOT_OFFERED])

        await choose(IMAGE, ASSET)
        await choose(BAND, 'class')
        expect(applyEnabled()).toBe(false)
        await expand(NOT_INCLUDED.description)
        await choose(BAND, 'class')
        expect(applyEnabled()).toBe(true)

        await clickConstraint(1)
        expect(constraintsMarked()).toEqual([false, false, false])
        expect(innermost(constraintOf('c-2', 'i-1', 'class', '<', 0.3).description)).toBeDefined()
    })

    it('keeps an invalid constraint expanded rather than give way to a valid one', async () => {
        const valid = constraintOf('c-4', 'i-1', 'class', '>', 5)
        await openForest(remappingRecipe([REMOVED_INPUT, NOT_INCLUDED, valid]))
        await expand(NOT_INCLUDED.description)

        await expand(valid.description)

        expect(errorsOf(BAND)).toEqual([expect.stringContaining('widget.imageConstraints.band.notOffered')])
        expect(innermost(valid.description)).toBeDefined()
    })

    it('offers the one input remaining for a removed one, without taking it until chosen', async () => {
        await openForest()

        await expand(REMOVED_INPUT.description)

        expect(constraint('c-1').image).toEqual('i-gone')
        await choose(IMAGE, ASSET)
        await choose(BAND, 'class')
        await expand(NOT_INCLUDED.description)
        await choose(BAND, 'class')
        await press('button.apply')

        expect(constraint('c-1')).toMatchObject({image: 'i-1', band: 'class', operator: '>', value: 100})
        expect(constraint('c-2')).toMatchObject({image: 'i-1', band: 'class', operator: '<', value: 0.3})
        expect(inError(MAPPING)).toBe(false)
        expect(rowsInError()).toEqual([])
        expect(retrieveOffered()).toBe(true)
    })

    it('is repaired by removing the constraints', async () => {
        await openForest()

        await removeConstraint(REMOVED_INPUT.description)
        await removeConstraint(NOT_INCLUDED.description)
        await press('button.apply')

        expect(entry('Forest').constraints).toEqual([])
        expect(inError(MAPPING)).toBe(false)
    })

    it('is kept as saved when a repair is cancelled', async () => {
        const saved = remappingRecipe()
        await openForest(saved)
        await expand(NOT_INCLUDED.description)
        await choose(BAND, 'class')

        await press('button.cancel')

        expect(model()).toEqual(saved.model)
        expect(inError(MAPPING)).toBe(true)
    })
})

describe('a valid mapping edited', () => {
    it('refuses to apply an invalid edit, leaving the applied mapping marked as sound and retrievable', async () => {
        const valid = constraintOf('c-4', 'i-1', 'class', '>', 5)
        const saved = remappingRecipe([valid])
        await openForest(saved)
        await expand(valid.description)

        await typeInto(field(VALUE).querySelector('input'), '')

        expect(applyEnabled()).toBe(false)
        expect(inError(MAPPING)).toBe(false)
        expect(rowsInError()).toEqual([])
        expect(retrieveOffered()).toBe(true)
        expect(model()).toEqual(saved.model)
    })
})

describe('Index Change\'s mapping, not checking references', () => {
    it('applies a constraint reading a band or an image it does not offer, as before', async () => {
        const constraints = [
            constraintOf('c-1', 'this-recipe', 'not_a_band', '>', 1),
            constraintOf('c-2', 'gone', 'difference', '>', 1)
        ]
        await open(indexChangeRecipe(constraints), <IndexChangeToolbar/>)
        await press('process.indexChange.panel.mapping.button.label')
        await openEntry('Decrease')

        await expand(constraints[0].description)
        expect(errorsOf(BAND)).toEqual([])
        await expand(constraints[1].description)
        expect(field(IMAGE)).toBeNull()

        expect(applyEnabled()).toBe(true)
    })
})

const ASSET = 'users/x/a'
const MAPPING = 'process.remapping.panel.mapping.button.label'
const IMAGE = 'widget.imageConstraints.image.label'
const BAND = 'widget.imageConstraints.band.label'
const VALUE = 'widget.imageConstraints.value.label'
const IMAGE_NOT_OFFERED = expect.stringContaining('widget.imageConstraints.image.notOffered')
const BAND_NOT_OFFERED = expect.stringContaining('widget.imageConstraints.band.notOffered')
const MISSING_INPUT = 'process.remapping.requirement.missingInput'

const constraintOf = (id, image, band, operator, value) => ({
    id, description: `${band} ${operator} ${value}`, image, band, property: null, bit: false, fromBit: null, toBit: null,
    fromBitInclusive: true, toBitInclusive: true, operator, value
})

const REMOVED_INPUT = constraintOf('c-1', 'i-gone', 'elevation', '>', 100)
const NOT_INCLUDED = constraintOf('c-2', 'i-1', 'ndvi', '<', 0.3)

// One asset input including `class` alone; Forest reads an input since removed and a band the input does not include,
// Water reads `class`.
const remappingRecipe = (forest = [REMOVED_INPUT, NOT_INCLUDED]) => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [
            {imageId: 'i-1', type: 'ASSET', id: ASSET, includedBands: [{id: 'b-class', band: 'class', type: 'continuous', legendEntries: []}]}
        ]},
        legend: {entries: [
            {id: 'l-1', color: '#00ff00', value: 1, label: 'Forest', booleanOperator: 'and', constraints: forest},
            {id: 'l-2', color: '#0000ff', value: 2, label: 'Water', booleanOperator: 'and', constraints: [constraintOf('c-3', 'i-1', 'class', '>', 2)]}
        ]}
    }
})

const indexChangeRecipe = constraints => ({
    id: 'index-change-1',
    type: 'INDEX_CHANGE',
    model: {
        ...indexChangeModel,
        legend: {entries: [{id: 'l-1', color: '#d73027', value: 1, label: 'Decrease', booleanOperator: 'and', constraints}]}
    }
})

// Forest's constraints opened from its row in Mapping.
async function openForest(saved = remappingRecipe()) {
    await open(saved, <RemappingToolbar/>)
    await press(MAPPING)
    await openEntry('Forest')
}

async function open(recipe, toolbar) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: {...recipe, revision: 1, ui: {initialized: true}}},
            recipes: [{id: recipe.id, name: 'Recipe', type: recipe.type, revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: recipe.id}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <SourceRuntimeProvider>
                    <Recipe id={recipe.id}>
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='panels'/>
                            <PortalContext id='panels'>
                                {toolbar}
                            </PortalContext>
                        </EventShield>
                    </Recipe>
                </SourceRuntimeProvider>
            </ActivationContext>
        </Provider>
    ))
    await settled()
}

// A button pressed, as a click; a disabled one ignores it.
async function press(label) {
    await act(async () => button(label).click())
    await settled()
}

// A legend entry's constraints opened from its row.
async function openEntry(label) {
    await click(innermost(label))
}

// A constraint in the modal expanded from its summary, which only a collapsed constraint shows.
async function expand(description) {
    await click(innermost(description))
}

// A constraint in the modal clicked by its row, expanded or not.
async function clickConstraint(index) {
    await click(constraintRows()[index].firstElementChild)
}

async function choose(label, option) {
    await click(field(label).querySelector('input'))
    await click([...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent.includes(option)))
}

// A constraint removed from the modal, its trash button pressed briefly, as a click.
async function removeConstraint(description) {
    let element = innermost(description)
    while (!element.querySelector('svg[data-icon="trash"]')) {
        element = element.parentElement
    }
    const trash = element.querySelector('svg[data-icon="trash"]').closest('button')
    await act(async () => ['mouseenter', 'mousedown', 'mouseup']
        .forEach(type => trash.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    await settled()
}

async function typeInto(input, text) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
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

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', 'remapping-1', 'model'])

const entry = label => model().legend.entries.find(entry => entry.label === label)

const constraint = id => entry('Forest').constraints.find(constraint => constraint.id === id)

// The deepest element showing exactly this text.
const innermost = text => [...document.querySelectorAll('*')]
    .filter(element => element.textContent === text && ![...element.children].some(child => child.textContent === text))
    .pop()

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

const applyEnabled = () => button('button.apply')?.disabled === false

// Whether the toolbar's Retrieve button can be pressed.
const retrieveOffered = () => ![...document.querySelectorAll('[data-tooltip]')]
    .find(element => element.dataset.tooltip.includes('process.retrieve.tooltip'))
    .querySelector('button').disabled

const inError = label => button(label).classList.contains(classOf(toolbarButtonStyles, 'error'))

const buttonTooltip = label => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.contains(button(label)))
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .join(' | ')

// The constraints of the open modal, in order: every list row but those of Mapping's legend entries.
const constraintRows = () => [...document.getElementsByClassName(classOf(listItemStyles, 'verticalWrapper'))]
    .filter(row => !['Forest', 'Water'].some(label => row.textContent.includes(label)))

// Whether each constraint's row, or a part of it, is in its error state.
const constraintsMarked = () => constraintRows()
    .map(row => row.classList.contains(listItemStyles.error) || !!row.querySelector(`.${listItemStyles.error}`))

// What each constraint's summary - its row's main part, not its fields - says of it.
const summaryTooltips = () => constraintRows()
    .map(row => [...row.querySelector(`.${classOf(listItemStyles, 'main')}`).querySelectorAll('[data-tooltip]')]
        .flatMap(element => JSON.parse(element.dataset.tooltip)))

// The legend entries whose rows in Mapping are in their error state, by label; a constraint's row names none.
const rowsInError = () => [...document.getElementsByClassName(classOf(listItemStyles, 'error'))]
    .map(row => ['Forest', 'Water'].find(label => row.textContent.includes(label)))
    .filter(Boolean)

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name]
}
