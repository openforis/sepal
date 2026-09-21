import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The panel's wiring only: that it obtains the source runtime from context and hands the Masking command its
// current recipe, the submitted options and the runtime's resolver. The Retrieve form itself is replaced, so no
// panel UI is rendered and nothing here depends on its markup.

const state = vi.hoisted(() => ({commands: [], panelProps: null, sourceRuntime: null}))

vi.mock('~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel', () => ({
    MosaicRetrievePanel: props => {
        state.panelProps = props
        return null
    }
}))

vi.mock('~/app/home/body/process/recipe/masking/maskingRecipe', () => ({
    RecipeActions: () => ({retrieve: () => undefined}),
    submitMaskingRetrieve: args => state.commands.push(args)
}))

const RECIPE = {id: 'masked-1', type: 'MASKING', model: {}, ui: {}}

vi.mock('~/app/home/body/process/recipeContext', () => ({
    withRecipe: () => Component => props =>
        React.createElement(Component, {...props, recipe: RECIPE, recipeId: 'masked-1'})
}))

const {withSourceRuntime, SourceRuntimeProvider} = await import('~/app/home/body/process/sourceRuntime/sourceRuntimeContext')
const {Retrieve} = await import('./retrieve')

const roots = []

beforeEach(() => {
    state.commands = []
    state.panelProps = null
    state.sourceRuntime = null
})

afterEach(() => {
    roots.splice(0).forEach(root => act(() => root.unmount()))
})

const Capture = withSourceRuntime()(({sourceRuntime}) => {
    state.sourceRuntime = sourceRuntime
    return null
})

const reducer = (current = {process: {loadedRecipes: {}}, user: {currentUser: {}}}) => current

const mount = () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(
        <Provider store={createStore(reducer)}>
            <SourceRuntimeProvider>
                <Capture/>
                <Retrieve/>
            </SourceRuntimeProvider>
        </Provider>
    ))
}

describe('the Masking Retrieve panel', () => {
    it('hands the command its current recipe, options and the runtime resolver', () => {
        mount()
        const retrieveOptions = {destination: 'GEE', bands: ['tStart']}
        const cachedResolver = vi.fn()

        act(() => state.panelProps.onRetrieve(retrieveOptions, {resolveImageOutput$: cachedResolver}))

        expect(state.commands).toHaveLength(1)
        const command = state.commands[0] || {}
        expect(command.recipe).toBe(RECIPE)
        expect(command.retrieveOptions).toBe(retrieveOptions)
        expect(command.resolveImageOutput$).toBe(cachedResolver)
        expect('loadedRecipes' in command).toBe(false)
    })

    // What the resolution answers about is this recipe's execution configuration together with the current
    // evidence about the source it inherits from; the title, the revision and the rest of `ui` are not part of
    // the question.
    it('gives the generic panel one cold resolution, identified by what the answer depends on', () => {
        mount()

        expect(state.panelProps.imageOutputResolution).toEqual({
            key: {model: RECIPE.model, evidence: null},
            state$: expect.objectContaining({subscribe: expect.any(Function)})
        })
        expect(state.panelProps.imageOutputResolution.key.model).toBe(RECIPE.model)
    })
})
