import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import errorIndicatorStyles from '~/widget/errorIndicator.module.css'
import listItemStyles from '~/widget/listItem.module.css'
import {Toolbar} from '~/widget/toolbar/toolbar'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// A recipe's saved image layer sources, none shown by any map area, as the map mounts what reads each and Layers lists
// them, over a real store: a source naming a recipe that no longer exists marks the Layers button and its own row,
// naming the recipe, without a notification, until it is removed or names a recipe that loads. The server answers at
// once.

vi.mock('~/apiRegistry', async () => {
    const {NEVER, of, throwError} = await import('rxjs')
    return {default: {
        recipe: {
            save$: () => NEVER,
            loadAll$: () => NEVER,
            load$: id => id === DELETED
                ? throwError(() => ({name: 'AjaxError', status: 404}))
                : id === PENDING ? NEVER : of({id, type: 'MOSAIC', title: `Recipe ${id}`, model: {}})
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
const notified = vi.hoisted(() => [])
vi.mock('~/widget/notifications', () => ({Notifications: {error: notification => notified.push(notification)}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const DELETED = 'deleted-recipe'
const PENDING = 'pending-recipe'

const {getImageLayerSource} = await import('../imageLayerSourceRegistry')
const {registerImageLayerSources} = await import('../imageLayerSources')
const {withRecipe} = await import('../recipeContext')
const {ImageLayerSources, removeImageLayerSource} = await import('./imageLayerSources')
const {MapLayout, MapLayoutButton} = await import('./mapLayout')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

registerImageLayerSources()

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'host-1'

let root, container, store

beforeEach(() => {
    notified.length = 0
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a saved layer source naming a recipe that no longer exists, shown by no map area', () => {
    it('marks Layers and its own row, naming the recipe, without a notification', async () => {
        await open()

        expect(notified).toEqual([])
        expect(layersMarked()).toBe(true)
        expect(rowsMarked()).toEqual(['Old mosaic'])
        expect(rowTooltip('Old mosaic')).toContain('imageLayerSources.Recipe.notFound')
        expect(rowTooltip('Old mosaic')).toContain('Old mosaic')
    })

    it('marks nothing once it is removed', async () => {
        await open()

        await act(async () => removeImageLayerSource({sourceId: 'missing-source', recipeId: ID}))

        expect(layersMarked()).toBe(false)
        expect(rowsMarked()).toEqual([])
    })

    it('marks nothing once it names another recipe, while that recipe is read', async () => {
        await open()

        await replaceRecipe(PENDING)

        expect(layersMarked()).toBe(false)
        expect(rowsMarked()).toEqual([])
    })

    it('marks nothing once it names a recipe that loads', async () => {
        await open()

        await replaceRecipe('recipe-3')

        expect(layersMarked()).toBe(false)
        expect(rowsMarked()).toEqual([])
        expect(model().layers.additionalImageLayerSources.map(({id}) => id))
            .toEqual(['missing-source', 'healthy-source', 'asset-source'])
    })
})

const SOURCES = [
    {id: 'missing-source', type: 'Recipe', sourceConfig: {recipeId: DELETED, description: 'Old mosaic'}},
    {id: 'healthy-source', type: 'Recipe', sourceConfig: {recipeId: 'recipe-2', description: 'Recipe recipe-2'}},
    {id: 'asset-source', type: 'Asset', sourceConfig: {asset: 'users/x/image', label: 'image'}}
]

// What reads each image layer source, mounted for every source whether or not an area shows it, as the map mounts it.
const SourceReaders = withRecipe(recipe => ({recipe, sources: selectFrom(recipe, 'layers.additionalImageLayerSources') || []}))(
    ({recipe, sources}) => <>{sources.map(source => getImageLayerSource({recipe, source}).sourceComponent).filter(Boolean)}</>
)

async function open() {
    const initialState = {
        dimensions: {width: 1280, height: 800},
        process: {
            loadedRecipes: {[ID]: {
                id: ID, type: 'MOSAIC', revision: 1, ui: {initialized: true}, model: {},
                layers: {
                    areas: {center: {id: 'default-layer', imageLayer: {sourceId: 'google'}, featureLayers: []}},
                    mode: 'grid',
                    additionalImageLayerSources: SOURCES
                }
            }},
            recipes: [{id: ID, name: 'Host', type: 'MOSAIC', revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            tabs: [{id: ID}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <Recipe id={ID}>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <SourceReaders/>
                            <MapLayout/>
                            <Toolbar vertical placement='top-right'>
                                <MapLayoutButton/>
                            </Toolbar>
                            <ImageLayerSources/>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </ActivationContext>
        </Provider>
    ))
    await settled()
}

// The source made to name another recipe, as Layers edits it in place.
async function replaceRecipe(recipeId) {
    await act(async () => actionBuilder('REPLACE_SOURCE_RECIPE')
        .set(['process.loadedRecipes', ID, 'layers.additionalImageLayerSources', {id: 'missing-source'}, 'sourceConfig.recipeId'], recipeId)
        .dispatch())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const layersButton = () => document.querySelector('svg[data-icon="layer-group"]').closest('button')

const layersMarked = () => layersButton().classList.contains(toolbarButtonStyles.error)

// The sources whose rows are marked in error, by the description each shows.
const rowsMarked = () => [...document.getElementsByClassName(errorIndicatorStyles.indicator)]
    .map(indicator => indicator.closest(`.${listItemStyles.verticalWrapper}`))
    .map(row => SOURCES.map(({sourceConfig: {description, label}}) => description || label).find(name => row.textContent.includes(name)))

const rowTooltip = name => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.closest(`.${listItemStyles.verticalWrapper}`)?.textContent.includes(name))
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .join(' | ')
