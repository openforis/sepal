import {act} from 'react'
import {expect, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {initStore} from '~/store'

import {recipeSessionOf, startRecipeSession} from './recipeSession'
import {checkSaves} from './recipeStorage.test.fixtures'

// A test's store installed as the application installs its own (index.jsx): with its recipe session, which lives as long
// as the store does. A test file disposes the sessions of the stores it installed as each test ends
// (`afterEach(disposeInstalledSessions)`), so nothing a test's session still has to do - a save being compressed or
// sent, a wait being timed - runs on into the next. Once all are disposed, the test fails for any save storage refused
// or could not process (checkSaves, recipeStorage.test.fixtures.js).
const installed = []

export const installStore = store => {
    initStore(store)
    startRecipeSession(store)
    installed.push(store)
    return store
}

export const disposeInstalledSessions = () => {
    installed.splice(0).forEach(store => recipeSessionOf(store).dispose())
    checkSaves()
}

// Opens a stored recipe in a test's installed store as navigation opens one (openRecipeById$, recipe.jsx): read from
// storage (recipeStorage.test.fixtures.js), opened through the store's session at the revision read, then given its tab,
// selected. What its editor shows of it besides (`ui`), a case gives as its editor would hold it after. Answers the recipe
// as opened.
export const openStoredRecipe = (store, storage, recipeId, {ui} = {}) => {
    const loaded = storage.stored(recipeId)
    if (!loaded) {
        throw new Error(`Recipe ${recipeId} is not stored`)
    }
    const {id, placeholder, title, type} = recipeSessionOf(store).openRecipeRevision(loaded)
    store.dispatch(actionBuilder('OPEN_RECIPE')
        .push('process.tabs', {id, placeholder, title, type})
        .set('process.selectedTabId', id)
        .build())
    if (ui) {
        store.dispatch(actionBuilder('SHOW_RECIPE', {recipeId: id})
            .assign(['process.loadedRecipes', id, 'ui'], ui)
            .build())
    }
    return store.getState().process.loadedRecipes[id]
}

// A store's starting state as a case writes it - the recipes it holds, those open in tabs among them - split into what
// the application starts from: storage holding every recipe saved, and a state without the open ones or their tabs.
// `openIn(store)`, once the store is installed, opens each as navigation opens it (openStoredRecipe), with its view state
// as written, then leaves the tabs and the selection as written. A recipe not saved yet - just created (`ui.unsaved`), or
// still being set up (`ui.initialized` false), which saveRecipe (recipe.jsx) does not save - is not stored, and stays
// held as written.
export const storedOpenRecipes = (state, storage) => {
    const {loadedRecipes = {}, tabs = [], selectedTabId} = state.process
    const saved = Object.values(loadedRecipes).filter(({ui}) => !ui?.unsaved && ui?.initialized !== false)
    saved.forEach(recipe => storage.store(recipe))
    const opened = saved.filter(recipe => tabs.some(({id}) => id === recipe.id))
    const isOpened = id => opened.some(recipe => recipe.id === id)
    return {
        state: {...state, process: {
            ...state.process,
            loadedRecipes: Object.fromEntries(Object.entries(loadedRecipes).filter(([id]) => !isOpened(id))),
            tabs: tabs.filter(({id}) => !isOpened(id))
        }},
        openIn: store => {
            opened.forEach(recipe => openStoredRecipe(store, storage, recipe.id, {ui: recipe.ui}))
            store.dispatch(actionBuilder('SHOW_TABS')
                .set('process.tabs', tabs)
                .set('process.selectedTabId', selectedTabId)
                .build())
        }
    }
}

// What reopening a recipe reads once its session has saved the draft as it stands: what storage answers, waited for while
// the save is compressed and sent. Content alone is compared, not the view state or what storage owns.
export const savedDraft = async (store, storage, recipeId) => {
    await act(async () => vi.waitFor(() =>
        expect(content(storage.stored(recipeId))).toEqual(content(store.getState().process.loadedRecipes[recipeId]))
    ))
    return storage.stored(recipeId)
}

const content = recipe => {
    const {ui: _ui, revision: _revision, projectId: _projectId, ...rest} = JSON.parse(JSON.stringify(recipe || {}))
    return rest
}
