import _ from 'lodash'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import buttonSelectStyles from '~/widget/buttonSelect.module.css'
import crudItemStyles from '~/widget/crudItem.module.css'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {Toolbar} from '~/widget/toolbar/toolbar'

import areaStyles from './areas.module.css'
import layerStyles from './imageLayerSources.module.css'

// Renaming, in the Layers panel as a user opens it from the toolbar, the layer sources a Masking recipe's layout does
// not own: one derived from an input it reads, and one kept from an input it no longer reads because a map area shows
// it. Its area shows the derived one. Activation is real; the recipe picker of the Edit form is not rendered.

vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: () => NEVER, loadAll$: () => NEVER, save$: () => NEVER}}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/recipeInput', () => ({RecipeInput: () => null}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => typeof msg === 'string'
        ? <span data-tooltip={msg}>{children}</span>
        : children
}))

// A menu opened ignores presses for its first moments (blurDetector.jsx), so a press elsewhere waits them out.
const MENU_SETTLED_MS = 150

const OPTICAL = 'optical-1'
const MASK = 'mask-1'
const OLD_INPUT = 'old-input'
const MANUAL = 'layer-1'
const LISTING = [{id: OPTICAL, name: 'optical'}, {id: MASK, name: 'mask'}, {id: OLD_INPUT, name: 'old input'}, {id: 'other', name: 'other'}]

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: masking} = await import('../recipe/masking/masking')
const {initializeLayers} = await import('../recipe/recipeImageLayerSource')
const {registerImageLayerSources} = await import('../imageLayerSources')
const {MapLayout, MapLayoutButton} = await import('./mapLayout')

addRecipeType(masking())
registerImageLayerSources()

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
})

describe('renaming a layer source derived from an input', () => {
    it('names it in Layers and in the area showing it, saving no source entry for it', async () => {
        await open(MASKING)
        const sources = recipe().layers.additionalImageLayerSources

        await rename('optical', 'Before the fire')

        expect(rows()).toEqual(['Before the fire', 'mask', 'old input', 'manual'])
        expect(shownOnMap()).toEqual(['Before the fire', 'old input'])
        expect(recipe().layers.additionalImageLayerSources).toBe(sources)
    })

    it('restores the name its input gives it once the name is cleared', async () => {
        await open(MASKING)
        await rename('optical', 'Before the fire')

        await rename('Before the fire', '')

        expect(rows()).toEqual(['optical', 'mask', 'old input', 'manual'])
        expect(shownOnMap()).toEqual(['optical', 'old input'])
        expect(recipe().layers.imageLayerSourceNames).toEqual({})
    })

    it('writes nothing when cancelled', async () => {
        await open(MASKING)
        const before = recipe()

        await openRename('optical')
        await type('Before the fire')
        await click('button.cancel')

        expect(recipe().layers).toBe(before.layers)
        expect(rows()).toEqual(['optical', 'mask', 'old input', 'manual'])
    })

    it('names it in the mark of a recipe no longer there', async () => {
        await open(_.set(_.cloneDeep(MASKING), ['ui', 'missingImageLayerSources', MASK], {recipeId: MASK}))

        await rename('mask', 'Cloud mask')

        expect(rowTooltip('Cloud mask')).toContain('Cloud mask')
    })

    it('keeps its name once another input is applied, saved and reopened', async () => {
        await open(MASKING)
        await rename('optical', 'Before the fire')

        await applyInput('imageToMask', 'other')
        await open(savedAndReopened())

        expect(rows()).toEqual(['other', 'mask', 'Before the fire', 'old input', 'manual'])
        expect(rowTooltip('Before the fire')).toBe('map.layout.legacySource')
        expect(shownOnMap()).toEqual(['Before the fire', 'old input'])
    })
})

describe('renaming a layer source kept from an input no longer read', () => {
    it('names it, and keeps the name once saved and reopened', async () => {
        await open(MASKING)

        await rename('old input', 'First optical')
        await open(savedAndReopened())

        expect(rows()).toEqual(['optical', 'mask', 'First optical', 'manual'])
        expect(rowTooltip('First optical')).toBe('map.layout.legacySource')
    })
})

describe('a layer source the layout added', () => {
    it('is still edited in the form that added it', async () => {
        await open(MASKING)

        await choose('manual', 'map.layout.layer.actions.edit')

        expect(document.body.textContent).toContain('map.layout.editImageLayerSource.types.Recipe.description')
        expect(document.body.textContent).not.toContain('map.layout.renameImageLayerSource.title')
    })
})

describe('a layer source row\'s actions', () => {
    it('are Rename or Edit as its owner allows, beside Delete, which says why it cannot where its inputs own it', async () => {
        await open(MASKING)

        expect(await offered('optical')).toEqual([
            {label: 'map.layout.layer.actions.rename'},
            {label: 'map.layout.layer.actions.delete', disabled: 'map.layout.layer.actions.deleteOwned'}
        ])
        expect(await offered('old input')).toEqual([
            {label: 'map.layout.layer.actions.rename'},
            {label: 'map.layout.layer.actions.delete'}
        ])
        expect(await offered('manual')).toEqual([
            {label: 'map.layout.layer.actions.edit'},
            {label: 'map.layout.layer.actions.delete'}
        ])
        expect(sourceRows().slice(0, recipe().ui.imageLayerSources.length).map(menuButton)).toEqual([null, null])
    })

    it('delete a source only once the deletion is confirmed', async () => {
        await open(MASKING)

        await choose('manual', 'map.layout.layer.actions.delete')
        expect(rows()).toContain('manual')
        await click('button.cancel')
        expect(rows()).toContain('manual')

        await choose('manual', 'map.layout.layer.actions.delete')
        await click('map.layout.layer.actions.delete')
        expect(rows()).not.toContain('manual')
    })

    it('close on Escape, and on a press elsewhere, choosing nothing', async () => {
        await open(MASKING)
        const before = recipe()

        await openMenu('manual')
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})))
        expect(menuOptions()).toEqual([])

        await openMenu('manual')
        await act(() => new Promise(resolve => setTimeout(resolve, MENU_SETTLED_MS)))
        await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles: true})))
        expect(menuOptions()).toEqual([])

        expect(rows()).toEqual(['optical', 'mask', 'old input', 'manual'])
        expect(recipe()).toBe(before)
    })
})

// Reading optical and mask; its center area shows optical and its left area the image it read before, each saved with
// the area as assigning it saves it; a recipe added in Layers, shown nowhere.
const MASKING = {
    id: 'masking-1',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: OPTICAL},
        imageMask: {type: 'RECIPE_REF', id: MASK}
    },
    layers: {
        mode: 'grid',
        areas: {
            center: {id: 'area-1', imageLayer: {sourceId: OPTICAL}, featureLayers: []},
            left: {id: 'area-2', imageLayer: {sourceId: OLD_INPUT}, featureLayers: []}
        },
        additionalImageLayerSources: [
            {id: OPTICAL, type: 'Recipe', sourceConfig: {recipeId: OPTICAL, description: 'optical'}},
            {id: OLD_INPUT, type: 'Recipe', sourceConfig: {recipeId: OLD_INPUT, description: 'old input'}},
            {id: MANUAL, type: 'Recipe', sourceConfig: {recipeId: 'other', description: 'manual'}}
        ]
    }
}

// Layers opened from the toolbar, as the recipe opens: its saved layers kept, its own sources added.
const open = async model => {
    await act(async () => root?.unmount())
    store = createStore(
        (state = {
            dimensions: {width: 1024, height: 768},
            process: {loadedRecipes: {[model.id]: model}, recipes: LISTING, projects: [], tabs: []}
        }, action) => action.reduce ? action.reduce(state) : state
    )
    initStore(store)
    initializeLayers({recipeId: model.id, savedLayers: model.layers})
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <Recipe id={model.id}>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <MapLayout/>
                            <Toolbar vertical placement='top-right'>
                                <MapLayoutButton/>
                            </Toolbar>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </ActivationContext>
        </Provider>
    ))
    await act(async () => document.querySelector('svg[data-icon="layer-group"]').closest('button').click())
}

const rename = async (name, newName) => {
    await openRename(name)
    await type(newName)
    await click('button.apply')
}

const openRename = name => choose(name, 'map.layout.layer.actions.rename')

// A row's action picked from its menu, as a user opens the menu and picks it.
const choose = async (name, action) => {
    await openMenu(name)
    await act(async () => menuOptions().find(option => option.textContent === action).click())
}

const openMenu = name => act(async () => menuButton(row(name)).click())

const menuButton = row => row.querySelector('button[aria-label="map.layout.layer.actions.label"]')

const menuOptions = () => [...document.querySelectorAll('[data-hook="option"]')]

// The actions a row's menu offers, each that cannot be chosen by why, the menu closed again.
const offered = async name => {
    await openMenu(name)
    const actions = [...document.querySelectorAll(`.${buttonSelectStyles.options} li`)].map(item => ({
        label: item.textContent,
        ...(item.querySelector('[data-hook="option"]') ? {} : {disabled: item.querySelector('[data-tooltip]')?.dataset.tooltip || true})
    }))
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})))
    return actions
}

const type = value => act(async () => {
    const input = document.querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
})

const click = label => act(async () => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    button.click()
})

// An input applied as its panel applies it: the model alone.
const applyInput = (path, id) => act(async () => store.dispatch({
    type: 'APPLY_INPUT',
    reduce: state => _.set(_.cloneDeep(state), ['process', 'loadedRecipes', MASKING.id, 'model', path], {type: 'RECIPE_REF', id})
}))

const recipe = () => store.getState().process.loadedRecipes[MASKING.id]

// What saving keeps of the recipe - everything but its view state - read back as a recipe opens.
const savedAndReopened = () => JSON.parse(JSON.stringify(_.omit(recipe(), ['ui'])))

// The image sources Layers lists after the recipe's own and the satellite imagery, by the description each shows.
const rows = () => sourceRows()
    .slice(recipe().ui.imageLayerSources.length)
    .map(description)

const row = name => sourceRows().find(row => description(row) === name)

// The row's own button, Edit or Rename, whichever it offers.

const rowTooltip = name => row(name)?.querySelector(`.${crudItemStyles.title}`)?.closest('[data-tooltip]')?.dataset.tooltip

const shownOnMap = () => [...document.querySelectorAll(`.${areaStyles.areaContent}`)].map(description)

const sourceRows = () => [...document.querySelectorAll(`.${layerStyles.imageSource}, .${layerStyles.removableImageSource}`)]

const description = element => element?.querySelector(`.${crudItemStyles.description}`)?.textContent || ''
