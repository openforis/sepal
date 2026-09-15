import {storedUsername} from '#sepal/username'

// An in-memory stand-in for the MySQL adapter. It models ordinary persistence for application tests, but
// not revision preconditions or concurrency; that evidence lives only in the real-MySQL suite.
class FakeRecipeRepository {
    #recipes = new Map()
    #projects = new Map()

    async saveRecipe({id, owner, projectId, name, type, typeVersion, content}) {
        const stored = this.#recipes.get(id)
        if (!stored) {
            this.#recipes.set(id, {
                id, owner: storedUsername(owner), projectId, name, type, typeVersion,
                content: persisted(content),
                revision: 1, removed: false,
                creationTime: new Date(0), updateTime: new Date(0)
            })
            return {outcome: 'saved', revision: 1}
        } else if (stored.removed || stored.owner !== storedUsername(owner)) {
            return {outcome: 'notFound'}
        } else {
            // Placement belongs to moveRecipes, so a save leaves projectId exactly as it found it.
            const revision = stored.revision + 1
            this.#recipes.set(id, {
                ...stored, name, typeVersion, content: persisted(content), revision
            })
            return {outcome: 'saved', revision}
        }
    }

    async findRecipe(id) {
        const stored = this.#visible(id)
        return stored
            ? {
                owner: stored.owner,
                recipe: {...clone(stored.content), projectId: stored.projectId, revision: stored.revision}
            }
            : null
    }

    async listRecipes(owner) {
        return this.#ownedBy(owner).map(({id, projectId, name, type, creationTime, updateTime, revision}) =>
            ({id, projectId, name, type, creationTime, updateTime, revision}))
    }

    async removeRecipes(recipeIds, owner) {
        recipeIds.forEach(id => this.#updateOwned(id, owner, stored => ({...stored, removed: true})))
    }

    async moveRecipes({projectId, recipeIds, owner}) {
        recipeIds.forEach(id => this.#updateOwned(id, owner, stored => ({...stored, projectId})))
    }

    async findRecipesToMigrate(type, version) {
        return [...this.#recipes.values()]
            .filter(stored => !stored.removed && stored.type === type && stored.typeVersion < version)
            .map(({id, owner, typeVersion, content}) => ({id, owner, typeVersion, content: clone(content)}))
    }

    async saveMigratedRecipe({id, owner, typeVersion, content}) {
        const stored = this.#recipes.get(id)
        if (!stored || stored.owner !== storedUsername(owner)) {
            throw new Error(`Migrating recipe ${id} updated 0 rows`)
        }
        this.#recipes.set(id, {
            ...stored, typeVersion,
            content: persisted(content),
            revision: stored.revision + 1
        })
    }

    async listProjects(owner) {
        return [...this.#projects.values()]
            .filter(project => project.username === storedUsername(owner))
            .map(project => ({...project}))
    }

    async saveProject({id, owner, name, parentId = null, defaultAssetFolder = null, defaultWorkspaceFolder = null}) {
        const username = storedUsername(owner)
        if (parentId && !this.#ownsProject(parentId, username)) {
            return {outcome: 'parentNotFound'}
        } else if (parentId && this.#descendsFrom(parentId, id, username)) {
            return {outcome: 'cycle'}
        } else {
            const stored = this.#projects.get(id)
            if (!stored) {
                this.#projects.set(id, {id, username, name, parentId, defaultAssetFolder, defaultWorkspaceFolder})
            } else if (stored.username === username) {
                this.#projects.set(id, {...stored, name, parentId, defaultAssetFolder, defaultWorkspaceFolder})
            }
            return {outcome: 'saved'}
        }
    }

    #ownsProject(id, username) {
        return this.#projects.get(id)?.username === username
    }

    #descendsFrom(parentId, id, username) {
        const visited = new Set()
        let current = parentId
        while (current && !visited.has(current)) {
            if (current === id) {
                return true
            }
            visited.add(current)
            const stored = this.#projects.get(current)
            current = stored?.username === username ? stored.parentId : null
        }
        return false
    }

    async removeProject(id, owner) {
        const username = storedUsername(owner)
        const stored = this.#projects.get(id)
        if (stored?.username !== username) {
            return {outcome: 'removed'}
        } else {
            const folders = [...this.#projects.values()]
                .filter(project => project.parentId === id && project.username === username).length
            const recipes = this.#ownedBy(owner).filter(recipe => recipe.projectId === id).length
            if (folders || recipes) {
                return {outcome: 'notEmpty', folders, recipes}
            } else {
                this.#projects.delete(id)
                return {outcome: 'removed'}
            }
        }
    }

    #visible(id) {
        const stored = this.#recipes.get(id)
        return stored && !stored.removed ? stored : null
    }

    #ownedBy(owner) {
        return [...this.#recipes.values()].filter(stored => stored.owner === storedUsername(owner) && !stored.removed)
    }

    #updateOwned(id, owner, update) {
        const stored = this.#visible(id)
        if (stored && stored.owner === storedUsername(owner)) {
            this.#recipes.set(id, update(stored))
        }
    }
}

// Stored documents are cloned in and out, so a caller holding a loaded recipe cannot reach back into
// storage through a nested object and change it without saving.
const persisted = content => {
    const stored = clone(content)
    delete stored.revision
    delete stored.projectId
    return stored
}

// Through JSON, as the column is: whatever MySQL storage would drop or reshape is dropped here too.
const clone = content => JSON.parse(JSON.stringify(content))

export {FakeRecipeRepository}
