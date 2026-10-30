import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {firstValueFrom, NEVER, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {PortalContainer} from '~/widget/portal'

// A rendered selector over a real store, a real form and the real Combo. What is stubbed is the two remote
// reads a selection triggers - the recipe read and the band read - so that whether a selection was acted on
// is observable without a backend.

const {bands$, load$, loadError, browsers} = vi.hoisted(() => ({bands$: vi.fn(), load$: vi.fn(), loadError: vi.fn(), browsers: []}))
vi.mock('~/apiRegistry', () => ({default: {gee: {bands$}, recipe: {load$, save$: () => NEVER}}}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: loadError}}))
vi.mock('~/translate', () => ({msg: key => key}))
// Cuts an import cycle the barrel would otherwise enter from the wrong side: the asset combo reaches
// `~/user`, which reaches a panel that reads `Form.Field` while the barrel is still evaluating. Nothing
// here renders one.
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// The browser is its own component, with its own test; what it is handed and what it hands back is the
// contract here.
vi.mock('~/app/home/body/process/recipeList/recipeBrowser', () => ({
    RecipeBrowser: props => {
        browsers.push(props)
        return <div data-browser/>
    }
}))
// Eligibility as the production registrations state it: neither CCDC nor the table recipe is offered as an image.
// What the segment declaration then says about CCDC is the real one.
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => ({id: type, type, imageSource: !['TABLE_ONLY', 'CCDC'].includes(type)}),
    isImageSource: recipeType => recipeType.imageSource
}))

const {RecipeInput} = await import('./recipeInput')
const {openRecipeById$} = await import('~/app/home/body/process/recipe')
const {maskableImage} = await import(
    '~/app/home/body/process/recipe/masking/panels/inputImage/recipeSection'
)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, loaded, loading, selected, form

beforeEach(() => {
    loaded = []
    loading = []
    selected = []
    loadError.mockReset()
    browsers.length = 0
    bands$.mockReset().mockImplementation(() => of(['red', 'nir']))
    load$.mockReset().mockImplementation(recipeId => of(recipeOf(recipeId)))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('the recipe an input belongs to', () => {
    // Excluding the owner is on top of what the caller already leaves out, not instead of it: the table
    // recipe is ruled ineligible.
    it('is not offered as its input, alongside what the caller already excludes', async () => {
        show({filter: type => type.imageSource})

        const options = await offered()

        expect(options).toEqual(['Another recipe', 'In another folder'])
    })

    // "The owner" holds the search as much as the two in both folders do; no folder heading holds it.
    it('is not found by a search either, which reaches every folder', async () => {
        show()

        const options = await search('the')

        expect(options).toEqual(['Another recipe', 'In another folder'])
    })

    it('is not handed to the browser', async () => {
        show()

        await browse()

        expect(browsedRecipeIds()).toEqual([OTHER, 'table', 'ccdc', 'elsewhere'])
    })

    // The saved model is only rewritten when the panel is applied. Clearing the value here would edit a
    // recipe the user has not touched, so the form is told the field is invalid instead - several panels
    // validate this field only for being non-blank, which an owner id satisfies.
    it('is left unchanged, unread and not applicable when it was already saved as the input', async () => {
        show({value: OWNER})

        expect(selectedValue()).toBe(OWNER)
        expect(bands$).not.toHaveBeenCalled()
        expect(loaded).toEqual([])
        expect(form.isInvalid()).toBe(true)
    })

    it('is replaced, read and applicable again once another recipe is chosen', async () => {
        show({value: OWNER})

        await choose('Another recipe')

        expect(selectedValue()).toBe(OTHER)
        expect(loaded).toEqual([{id: OTHER, bandNames: ['red', 'nir']}])
        expect(form.isInvalid()).toBe(false)
    })
})

describe('opening the selected recipe', () => {
    it('offers a disabled Open button without a selection and reads nothing', async () => {
        show({requests: {}})
        expect(openButton().disabled).toBe(true)
        await act(async () => openButton().click())
        expect(load$).not.toHaveBeenCalled()
    })

    it('selects an already open draft without reading or changing it or the selector', async () => {
        show({value: OTHER, requests: {}})
        const draft = {...recipeOf(OTHER), model: {unsaved: 'working draft'}}
        await session({tabs: [{id: OWNER}, {id: OTHER}], loadedRecipes: {...cachedRecipes(), [OTHER]: draft}})
        await act(async () => openButton().click())

        expect(processState().selectedTabId).toBe(OTHER)
        expect(processState().tabs.map(({id}) => id)).toEqual([OWNER, OTHER])
        expect(cachedRecipes()[OTHER]).toBe(draft)
        expect(load$).not.toHaveBeenCalled()
        expect(bands$).not.toHaveBeenCalled()
        expect(selectedValue()).toBe(OTHER)
        expect(form.isDirty()).toBe(false)
        expect(selected).toEqual([])
        expect(optionElements()).toEqual([])
    })

    it('loads authoritative content and its save revision into a new tab, bypassing a settled cache copy', async () => {
        show({value: OTHER, requests: {}})
        await session({tabs: [{id: OWNER}], loadedRecipes: {...cachedRecipes(), [OTHER]: {...recipeOf(OTHER), revision: 1}}})
        const stored = {...recipeOf(OTHER), title: 'Saved recipe', revision: 7, model: {saved: 'fresh'}}
        load$.mockReturnValue(of(stored))
        await act(async () => openButton().click())

        expect(load$).toHaveBeenCalledExactlyOnceWith(OTHER)
        expect(bands$).not.toHaveBeenCalled()
        expect(processState().tabs.map(({id}) => id)).toEqual([OWNER, OTHER])
        expect(processState().selectedTabId).toBe(OTHER)
        expect(cachedRecipes()[OTHER]).toMatchObject(stored)
        expect(processState().saveStates[OTHER]).toMatchObject({status: 'SAVED', revision: 7})
        expect(selectedValue()).toBe(OTHER)
        expect(form.isDirty()).toBe(false)
    })

    it.each(['SAVING', 'FAILED', 'CONFLICTED', 'UNRESOLVED'])('reopens a closed %s draft without replacing it or its save state', async status => {
        show({value: OTHER, requests: {}})
        const draft = {...recipeOf(OTHER), model: {unsaved: status}}
        const saveState = {status, revision: 4}
        await session({tabs: [{id: OWNER}], loadedRecipes: {...cachedRecipes(), [OTHER]: draft}, saveStates: {[OTHER]: saveState}})
        await act(async () => openButton().click())

        expect(cachedRecipes()[OTHER]).toBe(draft)
        expect(processState().saveStates[OTHER]).toBe(saveState)
        expect(processState().tabs.map(({id}) => id)).toEqual([OWNER, OTHER])
        expect(processState().selectedTabId).toBe(OTHER)
        expect(load$).not.toHaveBeenCalled()
    })

    it.each([true, false])('keeps a draft created during the read, whether still open (%s) or closed with unsettled saves', async open => {
        show({value: OTHER, requests: {}})
        await session({tabs: [{id: OWNER}]})
        const held = new Subject()
        load$.mockReturnValue(held)
        await act(async () => openButton().click())
        expect(openButton().disabled).toBe(true)
        const draft = {...recipeOf(OTHER), model: {unsaved: 'opened elsewhere'}}
        await session({
            tabs: open ? [{id: OWNER}, {id: OTHER}] : [{id: OWNER}],
            loadedRecipes: {...cachedRecipes(), [OTHER]: draft},
            saveStates: {[OTHER]: {status: 'SAVING', revision: 4}}
        })
        await act(async () => { held.next({...recipeOf(OTHER), revision: 7}); held.complete() })

        expect(cachedRecipes()[OTHER]).toBe(draft)
        expect(processState().tabs.map(({id}) => id)).toEqual([OWNER, OTHER])
        expect(processState().selectedTabId).toBe(OTHER)
    })

    it('uses the same authoritative opening path when the recipe list replaces its landing tab', async () => {
        show({requests: {}})
        await session({tabs: [{id: OWNER}]})
        await act(async () => firstValueFrom(openRecipeById$(OTHER, {inNewTab: false})))

        expect(load$).toHaveBeenCalledExactlyOnceWith(OTHER)
        expect(processState().tabs.map(({id}) => id)).toEqual([OTHER])
        expect(processState().selectedTabId).toBe(OTHER)
        expect(processState().saveStates[OTHER]).toMatchObject({status: 'SAVED', revision: 4})
    })

    it('does not replace another recipe if the user leaves the list while its load is pending', async () => {
        show({requests: {}})
        await session({tabs: [{id: 'landing'}, {id: OWNER}], selectedTabId: 'landing'})
        const held = new Subject()
        load$.mockReturnValue(held)
        const opening = firstValueFrom(openRecipeById$(OTHER, {inNewTab: false}))
        await session({selectedTabId: OWNER})
        await act(async () => { held.next(recipeOf(OTHER)); held.complete(); await opening })

        expect(processState().tabs.map(({id}) => id)).toEqual(['landing', OWNER, OTHER])
        expect(processState().selectedTabId).toBe(OTHER)
    })

    it('opens a saved selection in another folder without changing what is offered', async () => {
        show({value: 'elsewhere', keepSelection: true, requests: {}})
        await session({tabs: [{id: OWNER}]})
        await act(async () => openButton().click())

        expect(load$).toHaveBeenCalledExactlyOnceWith('elsewhere')
        expect(processState().selectedTabId).toBe('elsewhere')
        expect(selectedValue()).toBe('elsewhere')
        expect(await offered()).toEqual(['Another recipe', 'A table recipe', 'A CCDC', 'In another folder'])
    })

    it('reports a failed load without changing tabs, field validity or selection', async () => {
        show({value: OTHER, requests: {}})
        await session({tabs: [{id: OWNER}]})
        const error = new Error('Recipe unavailable')
        load$.mockReturnValue(throwError(() => error))
        await act(async () => openButton().click())

        expect(loadError).toHaveBeenCalledWith({message: 'widget.recipeInput.loadError', error})
        expect(processState().tabs).toEqual([{id: OWNER}])
        expect(processState().selectedTabId).toBe(OWNER)
        expect(selectedValue()).toBe(OTHER)
        expect(form.isInvalid()).toBe(false)
        expect(form.isDirty()).toBe(false)
        expect(selected).toEqual([])
        expect(openButton().disabled).toBe(false)
    })
})

it('reads the bands of an ordinary saved input on mount', async () => {
    show({value: OTHER})

    expect(loaded).toEqual([{id: OTHER, bandNames: ['red', 'nir']}])
})

// Map Layers displays a recipe rather than consuming one, and the training-data samplers read it once and
// persist the points. Neither becomes a dependency edge, so neither closes a cycle by naming this recipe.
it('offers and reads the recipe itself where the caller declares it is not an input', async () => {
    show({allowOwnRecipe: true})

    await choose('The owner')

    expect(loaded).toEqual([{id: OWNER, bandNames: ['red', 'nir']}])
})

// What a consumer asks to be given is what gets read. The selector offers, groups and validates without it.
describe('a caller that only wants to know what was selected', () => {
    it('reads nothing, on mount or on selection', async () => {
        show({value: OTHER, requests: {}})
        expect(load$).not.toHaveBeenCalled()

        await choose('A CCDC')

        expect(load$).not.toHaveBeenCalled()
        expect(bands$).not.toHaveBeenCalled()
        expect(loading).toEqual([])
        expect(selected).toEqual(['ccdc'])
    })

    // The selector's read used to populate the shared record cache as a side effect. A consumer that owns
    // its own loading must work from a cold one.
    it('leaves the record cache as it found it', async () => {
        show({requests: {}})

        await choose('Another recipe')

        expect(Object.keys(cachedRecipes())).toEqual([OWNER])
    })

    // Refusing to read is not refusing to validate: a recipe saved as its own input is still rejected.
    it('still refuses a saved self-reference', () => {
        show({value: OWNER, requests: {}})

        expect(form.isInvalid()).toBe(true)
        expect(load$).not.toHaveBeenCalled()
    })
})

// Clearing hands the selector no option at all, and the consumer has to be told - it is what tells a panel
// to drop whatever it derived from the selection.
describe('clearing the selection', () => {
    it('notifies the consumer that nothing is selected', async () => {
        show({value: OTHER, requests: {}})

        await clear()

        expect(selected).toEqual([undefined])
        expect(selectedValue()).toBeFalsy()
    })

    it('stops a read in flight from arriving after it', async () => {
        const records = []
        const held = new Subject()
        load$.mockReturnValue(held)
        show({requests: {onRecipeLoaded: ({recipe}) => records.push(recipe.id)}})
        await choose('Another recipe')

        await clear()
        await act(async () => {
            held.next(recipeOf(OTHER))
            held.complete()
        })

        expect(selected).toEqual([OTHER, undefined])
        expect(records).toEqual([])
    })
})

describe('a caller that wants the record', () => {
    it('is given it without a bands request', async () => {
        const records = []
        show({requests: {onRecipeLoaded: ({recipe, type}) => records.push({id: recipe.id, type: type.id})}})

        await choose('Another recipe')

        expect(records).toEqual([{id: OTHER, type: 'MOSAIC'}])
        expect(bands$).not.toHaveBeenCalled()
    })

    it('shares one record read with a caller that also wants bands', async () => {
        const records = []
        show({requests: {
            onRecipeLoaded: ({recipe}) => records.push(recipe.id),
            ...bandsRequested
        }})

        await choose('Another recipe')

        expect(records).toEqual([OTHER])
        expect(loaded).toEqual([{id: OTHER, bandNames: ['red', 'nir']}])
        expect(load$).toHaveBeenCalledTimes(1)
    })

    // A selection replaced while its read is in flight is no longer what the consumer asked about.
    it('is not given the record of a selection that has been replaced', async () => {
        const records = []
        const held = new Subject()
        load$.mockImplementation(recipeId => recipeId === OTHER ? held : of(recipeOf(recipeId)))
        show({requests: {onRecipeLoaded: ({recipe}) => records.push(recipe.id)}})
        await choose('Another recipe')

        await choose('A CCDC')
        await act(async () => {
            held.next(recipeOf(OTHER))
            held.complete()
        })

        expect(records).toEqual(['ccdc'])
    })
})

// Masking's own eligibility rule over the production CCDC declaration: a recipe with no canonical image
// output is still offered as the image to mask when it declares it may produce segments.
describe('a recipe that produces segments rather than an image', () => {
    it('is offered as the image to mask, where what the caller cannot use still is not', async () => {
        show({filter: maskableImage})

        const options = await offered()

        expect(options).toEqual(['Another recipe', 'A CCDC', 'In another folder'])
    })
})

// A search reaches every folder. It is not a second answer to what the caller can use.
it('excludes what the caller rules out from a search too', async () => {
    show({filter: type => type.imageSource})

    const options = await search('a')

    expect(options).toEqual(['Another recipe', 'In another folder'])
})

// A filter can state an eligibility rule rather than a requirement, so a selection it excludes is shown under its own
// heading, never called unsuitable here; the caller says what, if anything, is wrong with it.
describe('a selection the input does not offer', () => {
    it('is shown by its listed name to a caller keeping it, without offering anything else the filter excludes', async () => {
        show({value: 'table', filter: type => type.imageSource, keepSelection: true})

        const options = await offered()

        expect(options).toEqual(['A table recipe', 'Another recipe', 'In another folder'])
        expect(headings()).toEqual(['widget.recipeInput.selection', 'widget.recipeInput.recent'])
    })

    it('is shown as unlisted when the listing no longer names it', async () => {
        show({value: 'deleted-1', keepSelection: true})

        expect(await offered()).toContain('widget.recipeInput.unlisted')
    })

    it('is not shown to a caller that does not keep it', async () => {
        show({value: 'table', filter: type => type.imageSource})

        expect(await offered()).toEqual(['Another recipe', 'In another folder'])
    })
})

describe('the recipes on offer', () => {
    it('start with the ones changed last, from every folder, newest first', async () => {
        show({
            recipes: [
                {id: 'eleventh', name: 'Changed eleventh', type: 'MOSAIC', folderId: 'p1', updateTime: '2026-09-01'},
                {id: 'tenth', name: 'Changed tenth', type: 'MOSAIC', folderId: 'p1', updateTime: '2026-09-02'},
                ...recentRecipes(RECENT_COUNT - 2),
                {id: 'far', name: 'Changed last, far away', type: 'MOSAIC', folderId: 'p2', updateTime: '2026-10-15'}
            ]
        })

        const options = await offered()

        expect(headings()).toEqual(['widget.recipeInput.recent', '/Folder one'])
        expect(options).toEqual([
            'Changed last, far away',
            ...recentRecipes(RECENT_COUNT - 2).map(({name}) => name),
            'Changed tenth',
            'Changed eleventh'
        ])
    })

    it('are the rest under the path of the folder holding them', async () => {
        show({
            recipes: [
                ...recentRecipes(),
                {id: 'deep', name: 'Deep down', type: 'MOSAIC', folderId: 'p3'},
                {id: 'unfiled', name: 'Filed under nothing', type: 'MOSAIC'},
                {id: 'far', name: 'Far away', type: 'MOSAIC', folderId: 'p2'},
                {id: 'here', name: 'Right here', type: 'MOSAIC', folderId: 'p1'}
            ],
            folders: [...DEFAULT_FOLDERS, {id: 'p3', name: 'Inner', parentId: 'p1'}]
        })

        const options = await offered()

        expect(headings()).toEqual(['widget.recipeInput.recent', '/', '/Folder one', '/Folder oneInner', '/Folder two'])
        expect(options).toEqual([
            ...recentRecipes().map(({name}) => name),
            'Filed under nothing', 'Right here', 'Deep down', 'Far away'
        ])
    })

    it('are all under their folders while a search is typed, the ones changed last too', async () => {
        show({recipes: [{id: 'fresh', name: 'Fresh', type: 'MOSAIC', folderId: 'p2', updateTime: '2026-10-15'}]})

        const options = await search('fresh')

        expect(headings()).toEqual(['/Folder two'])
        expect(options).toEqual(['Fresh'])
    })
})

describe('the browser', () => {
    it('opens at the folder of the recipe being edited when nothing is selected', async () => {
        show()

        await browse()

        expect(lastBrowser().folderId).toBe('p1')
    })

    it('opens at the folder of the selected recipe', async () => {
        show({value: 'elsewhere', requests: {}})

        await browse()

        expect(lastBrowser().folderId).toBe('p2')
    })

    it('hands the field the recipe picked in it, and closes', async () => {
        show()
        await browse()

        await act(async () => lastBrowser().onSelect('elsewhere'))

        expect(selectedValue()).toBe('elsewhere')
        expect(loaded).toEqual([{id: 'elsewhere', bandNames: ['red', 'nir']}])
        expect(container.querySelector('[data-browser]')).toBeNull()
    })
})

describe('the headings of the folders on offer', () => {
    it('come back as they were, and none twice, when the search is cleared', async () => {
        show({
            recipes: [
                ...recentRecipes(),
                {id: OWNER, name: 'The owner', type: 'MOSAIC', folderId: 'p1'},
                {id: OTHER, name: 'Another recipe', type: 'MOSAIC', folderId: 'p1'},
                {id: 'far', name: 'Far away', type: 'MOSAIC', folderId: 'p2'},
                {id: 'further', name: 'Further away', type: 'MOSAIC', folderId: 'p3'}
            ],
            folders: [
                {id: 'p1', name: 'Zulu folder'},
                {id: 'p2', name: 'Shared name'},
                {id: 'p3', name: 'Shared name'}
            ]
        })
        await search('far')
        expect(headings()).toEqual(['/Shared name'])

        await search('')

        expect(headings()).toEqual(['widget.recipeInput.recent', '/Shared name', '/Shared name', '/Zulu folder'])
    })

    // Two different things read as the root: filed under nothing, and filed under a folder this session
    // cannot resolve.
    it('keep the root apart for each thing it stands for', async () => {
        show({
            recipes: [
                ...recentRecipes(),
                {id: OWNER, name: 'The owner', type: 'MOSAIC', folderId: 'p1'},
                {id: OTHER, name: 'Another recipe', type: 'MOSAIC', folderId: 'p1'},
                {id: 'unfiled', name: 'Filed under nothing', type: 'MOSAIC'},
                {id: 'unknown', name: 'Filed under a stranger', type: 'MOSAIC', folderId: 'unknown-a'}
            ],
            folders: [{id: 'p1', name: 'Zulu folder'}]
        })

        await offered()

        expect(headings()).toEqual(['widget.recipeInput.recent', NO_FOLDER, NO_FOLDER, '/Zulu folder'])
    })

    it('are found by any folder in their path, the top ones too, which a narrow heading leaves out', async () => {
        show({
            recipes: [{id: 'deep', name: 'Deep down', type: 'MOSAIC', folderId: 'p3'}],
            folders: [
                {id: 'p1', name: 'Top'},
                {id: 'p2', name: 'Middle', parentId: 'p1'},
                {id: 'p3', name: 'Lower', parentId: 'p2'}
            ]
        })
        await open()

        const options = await search('top')

        expect(options).toEqual(['Deep down'])
    })

    it('put the unfiled recipes first and the named folders in case-insensitive order', async () => {
        show({
            recipes: [
                {id: OWNER, name: 'The owner', type: 'MOSAIC'},
                {id: OTHER, name: 'Another recipe', type: 'MOSAIC'},
                {id: 'far', name: 'Far away', type: 'MOSAIC', folderId: 'p1'},
                {id: 'further', name: 'Further away', type: 'MOSAIC', folderId: 'p2'}
            ],
            folders: [{id: 'p1', name: 'Zebra folder'}, {id: 'p2', name: 'antelope folder'}]
        })
        await search('a')

        expect(headings()).toEqual([NO_FOLDER, '/antelope folder', '/Zebra folder'])
    })
})

describe('a large recipe listing', () => {
    const recipes = Array.from({length: 2000}, (_, index) => ({
        id: `recipe-${index}`,
        name: `Recipe ${String(index).padStart(4, '0')}`,
        type: 'MOSAIC',
        folderId: index < 1000 ? 'p1' : 'p2'
    }))

    it('renders a window and reaches a recipe in the last folder with End and Enter', async () => {
        show({recipes, requests: {}})
        await open()

        expect(optionElements().length).toBeGreaterThan(0)
        expect(optionElements().length).toBeLessThan(50)

        await act(async () => combo().dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true})))

        expect(headings()).toContain('/Folder two')
        expect(optionElements().map(option => option.textContent)).toContain('Recipe 1999')
        expect(optionElements().length).toBeLessThan(50)

        await act(async () => combo().dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))

        expect(selectedValue()).toBe('recipe-1999')
        expect(selected).toEqual(['recipe-1999'])
        expect(load$).not.toHaveBeenCalled()
    })

    it('opens on a saved recipe far down the current folder without rendering the whole listing', async () => {
        show({recipes, value: 'recipe-999', requests: {}})
        await open()

        expect(optionElements().map(option => option.textContent)).toContain('Recipe 0999')
        expect(optionElements().length).toBeLessThan(50)
        expect(selectedValue()).toBe('recipe-999')
        expect(form.isDirty()).toBe(false)
    })
})

const OWNER = 'owner'
const OTHER = 'other'
const NO_FOLDER = '/'
const RECENT_COUNT = 10
// Before any recipe a scenario dates, so a recipe it leaves undated is never among the ones changed last.
const LONG_AGO = '2020-01-01'

const DEFAULT_RECIPES = [
    {id: OWNER, name: 'The owner', type: 'MOSAIC', folderId: 'p1'},
    {id: OTHER, name: 'Another recipe', type: 'MOSAIC', folderId: 'p1'},
    {id: 'table', name: 'A table recipe', type: 'TABLE_ONLY', folderId: 'p1'},
    {id: 'ccdc', name: 'A CCDC', type: 'CCDC', folderId: 'p1'},
    {id: 'elsewhere', name: 'In another folder', type: 'MOSAIC', folderId: 'p2'}
]

const DEFAULT_FOLDERS = [{id: 'p1', name: 'Folder one'}, {id: 'p2', name: 'Folder two'}]

const fields = {recipe: new Form.Field()}

const bandsRequested = {
    onBandsLoaded: ({recipe, bandNames}) => loaded.push({id: recipe.id, bandNames})
}

const Host = withForm({fields})(({form: theForm, inputs: {recipe}, allowOwnRecipe, filter, keepSelection, requests}) => {
    form = theForm
    return (
        <RecipeInput
            input={recipe}
            allowOwnRecipe={allowOwnRecipe}
            filter={filter}
            keepSelection={keepSelection}
            allowClear
            onChange={id => selected.push(id)}
            onLoading={id => loading.push(id)}
            {...requests}
        />
    )
})

const show = ({
    value, allowOwnRecipe, filter, keepSelection, requests = bandsRequested,
    recipes = DEFAULT_RECIPES, folders = DEFAULT_FOLDERS
} = {}) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            selectedTabId: OWNER,
            loadedRecipes: {[OWNER]: {id: OWNER, type: 'MOSAIC', folderId: 'p1', model: {}}},
            recipes: recipes.map(recipe => ({updateTime: LONG_AGO, ...recipe})),
            folders,
            // No open tab: autosave is triggered from here and is not what a selector exercises.
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
            <EventShield>
                <Recipe id={OWNER}>
                    <Host
                        values={value === undefined ? {} : {recipe: value}}
                        allowOwnRecipe={allowOwnRecipe}
                        filter={filter}
                        keepSelection={keepSelection}
                        requests={requests}
                    />
                </Recipe>
            </EventShield>
        </Provider>
    ))
}

const combo = () => container.querySelector('input')

// What a panel reads when it is applied.
const recipeOf = recipeId => ({id: recipeId, type: 'MOSAIC', revision: 4, ui: {initialized: true}, model: {}})

const cachedRecipes = () => store.getState().process.loadedRecipes
const processState = () => store.getState().process
const session = values => act(async () => store.dispatch({type: 'SESSION_CHANGED', reduce: state => ({...state, process: {...state.process, ...values}})}))
const openButton = () => container.querySelector('button[aria-label="widget.recipeInput.open"]')

const selectedValue = () => form.values().recipe

const open = () => act(async () => combo().click())

const offered = async () => {
    await open()
    return optionElements().map(option => option.textContent)
}

const headings = () => [...document.querySelectorAll('li')]
    .filter(option => option.className.includes('sticky'))
    .map(option => option.textContent)

const optionElements = () => [...document.querySelectorAll('li')]
    .filter(option => !option.className.includes('sticky') && !option.hasAttribute('aria-hidden'))
    .map(option => option.firstElementChild)

// The control the user clicks to clear a selection, found by the icon that names it.
const clear = () => act(async () => {
    const clearButton = document.querySelector('[data-icon="xmark"]')?.closest('button')
    expect(clearButton, 'the selector offers no way to clear').toBeDefined()
    clearButton.click()
})

const choose = async label => act(async () => {
    await act(async () => combo().click())
    const option = optionElements().find(option => option.textContent === label)
    expect(option).toBeDefined()
    option.click()
})

// Typing is what Combo hears through the input's own value setter; React ignores a plain assignment.
const search = async text => {
    await act(async () => {
        const input = combo()
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    return optionElements().map(option => option.textContent)
}

const browse = () => act(async () =>
    document.querySelector('[data-icon="folder-open"]').closest('button').click()
)

const lastBrowser = () => browsers[browsers.length - 1]

const browsedRecipeIds = () => lastBrowser().recipes.map(({id}) => id)

// Filed under nothing and changed in the last days, newest first: the recipes a scenario adds are offered after them.
const recentRecipes = (count = RECENT_COUNT) => Array.from({length: count}, (_, index) => ({
    id: `recent-${index}`,
    name: `Recent ${index}`,
    type: 'MOSAIC',
    updateTime: `2026-10-${String(14 - index).padStart(2, '0')}`
}))
