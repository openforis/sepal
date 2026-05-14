import {vi} from 'vitest'

import {handleGuiAction} from '~/app/home/body/chat/guiActionRegistry'

import {registerProjectActions} from './projectActions'
import {registerRecipeActions} from './recipeActions'

const {recipeState, projectState} = vi.hoisted(() => ({
    recipeState: [{id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}],
    projectState: [{id: 'p1', name: 'Kenya'}]
}))

vi.mock('~/store', () => ({
    select: vi.fn(path => {
        if (path === 'process.recipes') return recipeState
        if (path === 'process.projects') return projectState
        return undefined
    }),
    subscribe: vi.fn()
}))

registerRecipeActions()
registerProjectActions()

it('handles the list-recipes action and responds with a {success, data} envelope carrying the recipe list', () => {
    let response
    const handled = handleGuiAction('list-recipes', {respond: r => { response = r }})

    expect(handled).toBe(true)
    expect(response).toEqual({success: true, data: recipeState})
})

it('handles the list-projects action and responds with a {success, data} envelope carrying the project list', () => {
    let response
    const handled = handleGuiAction('list-projects', {respond: r => { response = r }})

    expect(handled).toBe(true)
    expect(response).toEqual({success: true, data: projectState})
})
