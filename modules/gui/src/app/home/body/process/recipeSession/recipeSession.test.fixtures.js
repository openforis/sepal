import {initStore} from '~/store'

import {recipeSessionOf, startRecipeSession} from './recipeSession'

// A test's store installed as the application installs its own (index.jsx): with its recipe session, which lives as long
// as the store does. A test file disposes the sessions of the stores it installed as each test ends
// (`afterEach(disposeInstalledSessions)`), so nothing a test's session still has to do - a save being compressed or
// sent, a wait being timed - runs on into the next.
const installed = []

export const installStore = store => {
    initStore(store)
    startRecipeSession(store)
    installed.push(store)
    return store
}

export const disposeInstalledSessions = () =>
    installed.splice(0).forEach(store => recipeSessionOf(store).dispose())
