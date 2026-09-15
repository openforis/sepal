import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {NO_PROJECT_SYMBOL} from '~/app/home/body/process/recipeList/recipeListConstants'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {PortalContainer} from '~/widget/portal'

// A rendered selector over a real store, a real form and the real Combo. What is stubbed is the two remote
// reads a selection triggers - the recipe read and the band read - so that whether a selection was acted on
// is observable without a backend.

const {bands$, load$} = vi.hoisted(() => ({bands$: vi.fn(), load$: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {gee: {bands$}, recipe: {load$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
// Cuts an import cycle the barrel would otherwise enter from the wrong side: the asset combo reaches
// `~/user`, which reaches a panel that reads `Form.Field` while the barrel is still evaluating. Nothing
// here renders one.
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// The legacy flag as the production definitions carry it: CCDC and the table recipe both declare they have
// no canonical image output. What the segment declaration then says about CCDC is the real one.
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => ({type, noImageOutput: ['TABLE_ONLY', 'CCDC'].includes(type)})
}))

const {RecipeInput} = await import('./recipeInput')
const {maskableImage} = await import(
    '~/app/home/body/process/recipe/masking/panels/inputImage/recipeSection'
)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, loaded, form

beforeEach(() => {
    loaded = []
    bands$.mockReset().mockImplementation(() => of(['red', 'nir']))
    load$.mockReset().mockImplementation(recipeId => of({id: recipeId, type: 'MOSAIC', model: {}}))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('the recipe an input belongs to', () => {
    // Excluding the owner is on top of what the caller and the current project already leave out, not
    // instead of either: the table recipe is ruled ineligible and the one in another project is elsewhere.
    it('is not offered as its input, alongside what the caller and the project already exclude', async () => {
        show({filter: type => !type.noImageOutput})

        const options = await offered()

        expect(options).toEqual(['Another recipe'])
    })

    it('is not offered in the ALL view either, where every project is', async () => {
        show()

        await showAll()
        const options = await offered()

        expect(options).toEqual(['Another recipe', 'A table recipe', 'A CCDC', 'In another project'])
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

// Masking's own eligibility rule over the production CCDC declaration: a recipe with no canonical image
// output is still offered as the image to mask when it declares it may produce segments.
describe('a recipe that produces segments rather than an image', () => {
    it('is offered as the image to mask in its own project, without the ALL view', async () => {
        show({filter: maskableImage})

        const options = await offered()

        expect(options).toEqual(['Another recipe', 'A CCDC'])
    })

    it('is offered across projects in the ALL view, where what the caller cannot use still is not', async () => {
        show({filter: maskableImage})

        await showAll()
        const options = await offered()

        expect(options).toEqual(['Another recipe', 'A CCDC', 'In another project'])
    })
})

// ALL widens which projects are offered. It is not a second answer to what the caller can use.
it('excludes what the caller rules out in the ALL view too', async () => {
    show({filter: type => !type.noImageOutput})

    await showAll()
    const options = await offered()

    expect(options).toEqual(['Another recipe', 'In another project'])
})

describe('the headings of the projects on offer', () => {
    it('leave none of a name behind when the view they belong to is left', async () => {
        show({
            recipes: [
                {id: OWNER, name: 'The owner', type: 'MOSAIC', projectId: 'p1'},
                {id: OTHER, name: 'Another recipe', type: 'MOSAIC', projectId: 'p1'},
                {id: 'far', name: 'Far away', type: 'MOSAIC', projectId: 'p2'},
                {id: 'further', name: 'Further away', type: 'MOSAIC', projectId: 'p3'}
            ],
            projects: [
                {id: 'p1', name: 'Zulu project'},
                {id: 'p2', name: 'Shared name'},
                {id: 'p3', name: 'Shared name'}
            ]
        })
        await open()

        await showAll()
        expect(headings()).toEqual(['Shared name', 'Shared name', 'Zulu project'])
        await showAll()

        expect(headings()).toEqual(['Zulu project'])
    })

    // Three different things read as "[no project]": filed under nothing, filed under a project this
    // session cannot resolve, and filed under the very symbol that stands for being unfiled.
    it('leave none of the no-project label behind when what it stands for goes', async () => {
        show({
            recipes: [
                {id: OWNER, name: 'The owner', type: 'MOSAIC', projectId: 'p1'},
                {id: OTHER, name: 'Another recipe', type: 'MOSAIC', projectId: 'p1'},
                {id: 'unfiled', name: 'Filed under nothing', type: 'MOSAIC'},
                {id: 'symbol', name: 'Filed under the symbol', type: 'MOSAIC', projectId: NO_PROJECT_SYMBOL},
                {id: 'unknown', name: 'Filed under a stranger', type: 'MOSAIC', projectId: 'unknown-a'}
            ],
            projects: [{id: 'p1', name: 'Zulu project'}]
        })
        await open()

        await showAll()
        expect(headings()).toEqual([NO_PROJECT, NO_PROJECT, NO_PROJECT, 'Zulu project'])
        await showAll()

        expect(headings()).toEqual(['Zulu project'])
    })

    it('put the unfiled recipes first and the named projects in case-insensitive order', async () => {
        show({
            recipes: [
                {id: OWNER, name: 'The owner', type: 'MOSAIC'},
                {id: OTHER, name: 'Another recipe', type: 'MOSAIC'},
                {id: 'far', name: 'Far away', type: 'MOSAIC', projectId: 'p1'},
                {id: 'further', name: 'Further away', type: 'MOSAIC', projectId: 'p2'}
            ],
            projects: [{id: 'p1', name: 'Zebra project'}, {id: 'p2', name: 'antelope project'}]
        })
        await open()

        await showAll()

        expect(headings()).toEqual([NO_PROJECT, 'antelope project', 'Zebra project'])
    })
})

const OWNER = 'owner'
const OTHER = 'other'
const NO_PROJECT = 'process.project.noProjectOption'

const DEFAULT_RECIPES = [
    {id: OWNER, name: 'The owner', type: 'MOSAIC', projectId: 'p1'},
    {id: OTHER, name: 'Another recipe', type: 'MOSAIC', projectId: 'p1'},
    {id: 'table', name: 'A table recipe', type: 'TABLE_ONLY', projectId: 'p1'},
    {id: 'ccdc', name: 'A CCDC', type: 'CCDC', projectId: 'p1'},
    {id: 'elsewhere', name: 'In another project', type: 'MOSAIC', projectId: 'p2'}
]

const DEFAULT_PROJECTS = [{id: 'p1', name: 'Project one'}, {id: 'p2', name: 'Project two'}]

const fields = {recipe: new Form.Field()}

const Host = withForm({fields})(({form: theForm, inputs: {recipe}, allowOwnRecipe, filter}) => {
    form = theForm
    return (
        <RecipeInput
            input={recipe}
            allowOwnRecipe={allowOwnRecipe}
            filter={filter}
            onLoaded={({recipe, bandNames}) => loaded.push({id: recipe.id, bandNames})}
        />
    )
})

const show = ({value, allowOwnRecipe, filter, recipes = DEFAULT_RECIPES, projects = DEFAULT_PROJECTS} = {}) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {[OWNER]: {id: OWNER, type: 'MOSAIC', projectId: 'p1', model: {}}},
            recipes,
            projects,
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
                    />
                </Recipe>
            </EventShield>
        </Provider>
    ))
}

const combo = () => container.querySelector('input')

// What a panel reads when it is applied.
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
    .filter(option => !option.className.includes('sticky'))
    .map(option => option.firstElementChild)

const choose = async label => act(async () => {
    await act(async () => combo().click())
    const option = optionElements().find(option => option.textContent === label)
    expect(option).toBeDefined()
    option.click()
})

const showAll = () => act(async () =>
    [...document.querySelectorAll('button')].find(button => button.textContent === 'ALL').click()
)
