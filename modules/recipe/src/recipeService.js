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

    async moveRecipes({principal, projectId, recipeIds}) {
        await this.#repository.moveRecipes({projectId, recipeIds, owner: principal.username})
        return await this.#repository.listRecipes(principal.username)
    }

    listProjects({principal}) {
        return this.#repository.listProjects(principal.username)
    }

    async saveProject({principal, project}) {
        await this.#repository.saveProject({...project, owner: principal.username})
        return await this.#repository.listProjects(principal.username)
    }

    async removeProject({principal, projectId}) {
        await this.#repository.removeProject(projectId, principal.username)
        return await this.#repository.listProjects(principal.username)
    }
}

// A recipe someone else owns is reported missing rather than forbidden, so ownership stays undisclosed.
const isVisibleTo = (principal, owner) =>
    storedUsername(owner) === storedUsername(principal.username) || (principal.roles || []).includes(ADMIN_ROLE)

export {RecipeService}
