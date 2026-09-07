// An in-memory stand-in for the MySQL adapter. It models ordinary persistence for application tests, but
// not revision preconditions or concurrency; that evidence lives only in the real-MySQL suite.
class FakeRecipeRepository {
    #recipes = new Map()
    #projects = new Map()

    async saveRecipe({id, owner, projectId, name, type, typeVersion, content}) {
        const stored = this.#recipes.get(id)
        if (!stored) {
            this.#recipes.set(id, {
                id, owner, projectId, name, type, typeVersion,
                content: persisted(content),
                revision: 1, removed: false,
                creationTime: new Date(0), updateTime: new Date(0)
            })
            return {outcome: 'saved', revision: 1}
        } else if (stored.removed || stored.owner !== owner) {
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
        if (!stored || stored.owner !== owner) {
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
            .filter(project => project.username === owner)
            .map(project => ({...project}))
    }

    async saveProject({id, owner, name, defaultAssetFolder = null, defaultWorkspaceFolder = null}) {
        const stored = this.#projects.get(id)
        if (!stored) {
            this.#projects.set(id, {id, username: owner, name, defaultAssetFolder, defaultWorkspaceFolder})
        } else if (stored.username === owner) {
            this.#projects.set(id, {...stored, name, defaultAssetFolder, defaultWorkspaceFolder})
        }
    }

    async removeProject(id, owner) {
        const stored = this.#projects.get(id)
        if (stored && stored.username === owner) {
            this.#projects.delete(id)
            this.#ownedBy(owner)
                .filter(recipe => recipe.projectId === id)
                .forEach(recipe => this.#recipes.set(recipe.id, {...recipe, removed: true}))
        }
    }

    #visible(id) {
        const stored = this.#recipes.get(id)
        return stored && !stored.removed ? stored : null
    }

    #ownedBy(owner) {
        return [...this.#recipes.values()].filter(stored => stored.owner === owner && !stored.removed)
    }

    #updateOwned(id, owner, update) {
        const stored = this.#visible(id)
        if (stored && stored.owner === owner) {
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
