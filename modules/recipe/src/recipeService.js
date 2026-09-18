import {storedUsername} from '#sepal/username'

import {currentVersionForType} from './migration/registry.js'

const ADMIN_ROLE = 'application_admin'

class RecipeService {
    #repository

    constructor(repository) {
        this.#repository = repository
    }

    async loadRecipe({principal, recipeId}) {
        const stored = await this.#repository.findRecipe(recipeId)
        return stored && isVisibleTo(principal, stored.owner) ? stored.recipe : null
    }

    listRecipes({principal}) {
        return this.#repository.listRecipes(principal.username)
    }

    saveRecipe({principal, recipe, expectedRevision}) {
        return this.#repository.saveRecipe({
            ...recipe,
            owner: principal.username,
            typeVersion: currentVersionForType(recipe.type),
            expectedRevision
        })
    }

    async removeRecipes({principal, recipeIds}) {
        await this.#repository.removeRecipes(recipeIds, principal.username)
        return await this.#repository.listRecipes(principal.username)
    }

    async moveRecipes({principal, folderId, recipeIds}) {
        await this.#repository.moveRecipes({folderId, recipeIds, owner: principal.username})
        return await this.#repository.listRecipes(principal.username)
    }

    listFolders({principal}) {
        return this.#repository.listFolders(principal.username)
    }

    async saveFolder({principal, folder}) {
        const result = await this.#repository.saveFolder({...folder, owner: principal.username})
        return result.outcome === 'saved'
            ? {outcome: 'saved', folders: await this.#repository.listFolders(principal.username)}
            : result
    }

    async removeFolder({principal, folderId}) {
        const result = await this.#repository.removeFolder(folderId, principal.username)
        return result.outcome === 'removed'
            ? {outcome: 'removed', folders: await this.#repository.listFolders(principal.username)}
            : result
    }
}

// A recipe someone else owns is reported missing rather than forbidden, so ownership stays undisclosed.
const isVisibleTo = (principal, owner) =>
    storedUsername(owner) === storedUsername(principal.username) || (principal.roles || []).includes(ADMIN_ROLE)

export {RecipeService}
