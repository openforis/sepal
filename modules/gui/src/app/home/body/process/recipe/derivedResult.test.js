import {legacy_createStore as createStore} from 'redux'
import {describe, expect, it} from 'vitest'

import {SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'
import {actionBuilder} from '~/action-builder'
import {addRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

import {commitRecipe} from './derivedResult'

// What a commit derives for a type declaring an applied derivation: an ordered list of cells, each the value of the cell
// it reads by name plus its own offset, and the total of them all - over a real store.

describe('a commit', () => {
    it('derives, in its own action, each cell from those before it as just derived, and what else they change', () => {
        open([cell('a', {offset: 1, value: 1}), cell('b', {reads: 'a', offset: 1, value: 2}), cell('c', {reads: 'b', offset: 1, value: 3})])
        const writes = []
        const unsubscribe = store.subscribe(() => writes.push(model()))

        setCell('a', {offset: 10})
        unsubscribe()

        expect(values()).toEqual([10, 11, 12])
        expect(model().total).toBe(33)
        expect(writes).toEqual([model()])
    })

    it('keeps a cell whose inputs it leaves as they were, though deriving it would change it', () => {
        open([cell('a', {offset: 1, value: 1}), cell('b', {reads: 'a', offset: 1, value: 99}), cell('c', {offset: 1, value: 1})])

        setCell('c', {offset: 2})

        expect(values()).toEqual([1, 99, 2])
    })

    it('keeps a cell whose requirement is not met, and every cell reading it', () => {
        open([cell('a', {offset: 1, value: 1}), cell('b', {reads: 'a', offset: 1, value: 2}), cell('c', {reads: 'b', offset: 1, value: 3})])

        setCell('b', {reads: 'missing'})

        expect(values()).toEqual([1, 2, 3])
    })

    it('has a cell follow what it reads before it is read', () => {
        open([cell('a', {offset: 1, value: 1}), cell('b', {reads: 'a', offset: 1, value: 2})])

        setCell('a', {name: 'renamed', offset: 5})

        expect(cells()[1]).toMatchObject({reads: 'renamed', value: 6})
    })
})

describe('a commit for a type deriving from the recipe as a whole', () => {
    it('derives, in its own action, what the declaration follows', () => {
        openSums([1, 2])
        const writes = []
        const unsubscribe = store.subscribe(() => writes.push(sumsModel()))

        setTerms([1, 2, 3])
        unsubscribe()

        expect(sumsModel().summary).toEqual({sum: 6})
        expect(writes).toEqual([sumsModel()])
    })

    it('leaves what it follows as it was where the commit changes nothing it follows', () => {
        openSums([1, 2])
        const summary = sumsModel().summary

        setTerms([2, 1])

        expect(sumsModel().summary).toBe(summary)
    })
})

const ID = 'cells-1'
const SUMS_ID = 'sums-1'

let store

addRecipeType({
    id: 'CELLS',
    imageSource: false,
    derivedResults: [{
        id: 'cells.values',
        applied: {
            items: 'cells.cells',
            read: (model, index) => {
                const {cells} = model.cells
                const source = cells.slice(0, index).find(({name}) => name === cells[index].reads)
                return {
                    id: cells[index].id,
                    facts: {reads: cells[index].reads, source},
                    prerequisites: source ? [{declaration: 'cells.values', item: source.id}] : []
                }
            },
            requirement: {
                evaluate: ({reads, source}) => !reads || source ? {status: SUPPORTED} : unsupported({code: 'MISSING_CELL'})
            },
            inputs: ({facts: {source}}, {offset}) => ({offset, source: source?.value}),
            follow: (cell, {previous, model}) => {
                const read = previous.cells.cells.find(({name}) => name === cell.reads)
                const now = read && model.cells.cells.find(({id}) => id === read.id)
                return now && now.name !== cell.reads ? {...cell, reads: now.name} : cell
            },
            derive: (cell, {facts: {source}}) => ({...cell, value: (source?.value || 0) + cell.offset}),
            followRecipe: (_previous, recipe) => [
                {path: 'model.total', value: recipe.model.cells.cells.reduce((total, {value}) => total + value, 0)}
            ]
        }
    }]
})

addRecipeType({
    id: 'SUMS',
    imageSource: false,
    derivedResults: [{
        id: 'sums.summary',
        applied: {
            followRecipe: (_previous, recipe) => [
                {path: 'model.summary', value: {sum: recipe.model.terms.reduce((sum, term) => sum + term, 0)}}
            ]
        }
    }]
})

const cell = (name, properties) => ({id: `${name}-id`, name, reads: null, ...properties})

function open(cells) {
    const initialState = {
        process: {loadedRecipes: {[ID]: {id: ID, type: 'CELLS', model: {cells: {cells}, total: 0}}}}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
}

function setCell(name, changes) {
    commitRecipe(['process.loadedRecipes', ID], actionBuilder('SET_CELL')
        .assign(['process.loadedRecipes', ID, 'model.cells.cells', {id: `${name}-id`}], changes))
}

function model() {
    return selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])
}

function cells() {
    return model().cells.cells
}

function values() {
    return cells().map(({value}) => value)
}

function openSums(terms) {
    const initialState = {
        process: {loadedRecipes: {[SUMS_ID]: {id: SUMS_ID, type: 'SUMS', model: {terms, summary: {sum: 3}}}}}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
}

function setTerms(terms) {
    commitRecipe(['process.loadedRecipes', SUMS_ID], actionBuilder('SET_TERMS')
        .set(['process.loadedRecipes', SUMS_ID, 'model.terms'], terms))
}

function sumsModel() {
    return selectFrom(store.getState(), ['process.loadedRecipes', SUMS_ID, 'model'])
}
