import {describe, expect, it} from 'vitest'

import {defaultColor} from '~/widget/form/colorInput'

import {committedTransitions} from './derivations'

// The transition legend a commit leaves a Class Change with, from the model before the commit and the model as the
// commit leaves it. A transition is coded from each image's legend, in entry order, and is known by its two classes'
// values: what the user customised of it follows it to its new code, and what was its default is derived again.

describe('the transition legend a commit derives', () => {
    it('codes each from class with each to class, in each legend\'s entry order, with default labels and colours', () => {
        const legend = committedTransitions(classChange({from: [FOREST, WATER]}), classChange({from: [FOREST, WATER], to: [WATER, FOREST]}))

        expect(legend.map(({value, label, color}) => ({value, label, color}))).toEqual([
            {value: 1, label: 'Forest -> Water', color: defaultColor(1)},
            {value: 2, label: 'Forest -> Forest', color: defaultColor(2)},
            {value: 3, label: 'Water -> Water', color: defaultColor(3)},
            {value: 4, label: 'Water -> Forest', color: defaultColor(4)}
        ])
    })

    it('is the same, ids included, each time the same commit is derived', () => {
        const previous = classChange({from: [FOREST, WATER]})
        const model = classChange({from: [FOREST, WATER], to: [FOREST, WATER]})

        const legend = committedTransitions(previous, model)

        expect(committedTransitions(previous, model)).toEqual(legend)
        expect(new Set(legend.map(({id}) => id)).size).toBe(4)
    })

    it.each([
        ['without one', undefined],
        ['with one saved empty', []]
    ])('fills in the transition legend of a recipe saved %s at its next commit', (_saved, transitions) => {
        const saved = classChange({from: [FOREST, WATER], to: [FOREST, WATER], transitions})

        const legend = committedTransitions(saved, {...saved, options: {minConfidence: 10}})

        expect(legend.map(({label}) => label)).toEqual(['Forest -> Forest', 'Forest -> Water', 'Water -> Forest', 'Water -> Water'])
    })

    it('keeps the transition legend as saved while either image has no classes', () => {
        const saved = classChange({from: [FOREST, WATER], to: [FOREST, WATER], transitions: customised(SAVED, 4, PERMANENT_WATER)})

        expect(committedTransitions(saved, {...saved, toImage: image([])})).toEqual(saved.legend.entries)
    })

    it('keeps the labels and colours a Legend commit gives', () => {
        const saved = classChange({from: [FOREST, WATER], to: [FOREST, WATER], transitions: SAVED})
        const edited = customised(SAVED, 4, PERMANENT_WATER)

        expect(committedTransitions(saved, {...saved, legend: {entries: edited}})).toEqual(edited)
    })
})

describe('a commit changing nothing a transition reads', () => {
    it.each([
        ['a class colour', image => ({...image, legendEntries: [{...FOREST, color: '#ffffff'}, WATER]})],
        ['the classes\' entry ids', image => ({...image, legendEntries: image.legendEntries.map(entry => ({...entry, id: `new-${entry.id}`}))})],
        ['the class band', image => ({...image, band: 'other'})],
        ['the source', image => ({...image, id: 'users/x/other'})],
        ['the band snapshot', image => ({...image, bands: {class: {values: [1, 2]}, other: {}}})]
    ])('keeps the saved legend as %s changes, even one its classes cannot identify', (_change, change) => {
        const saved = classChange({from: [FOREST, WATER], to: [FOREST, WATER], transitions: customised(SAVED, 4, PERMANENT_WATER).slice(1)})

        expect(committedTransitions(saved, {...saved, fromImage: change(saved.fromImage)})).toEqual(saved.legend.entries)
    })
})

describe('a commit changing the classes', () => {
    const saved = classChange({from: [FOREST, WATER], to: [FOREST, WATER], transitions: customised(SAVED, 4, PERMANENT_WATER)})

    it('moves a customised transition, its id, label and colour, to its new code as a class is added', () => {
        const legend = committedTransitions(saved, {...saved, toImage: image([FOREST, WATER, URBAN])})

        expect(legend).toEqual([
            {id: 't-1', value: 1, label: 'Forest -> Forest', color: defaultColor(1)},
            {id: 't-2', value: 2, label: 'Forest -> Water', color: defaultColor(2)},
            {id: expect.any(String), value: 3, label: 'Forest -> Urban', color: defaultColor(3)},
            {id: 't-3', value: 4, label: 'Water -> Forest', color: defaultColor(4)},
            {id: 't-4', value: 5, ...PERMANENT_WATER},
            {id: expect.any(String), value: 6, label: 'Water -> Urban', color: defaultColor(6)}
        ])
    })

    it('drops the transitions of a removed class, keeping the others\' customisations', () => {
        const legend = committedTransitions(saved, {...saved, toImage: image([WATER])})

        expect(legend).toEqual([
            {id: 't-2', value: 1, label: 'Forest -> Water', color: defaultColor(1)},
            {id: 't-4', value: 2, ...PERMANENT_WATER}
        ])
    })

    it('follows reordered classes, the default colours taking their new codes', () => {
        const legend = committedTransitions(saved, {...saved, fromImage: image([WATER, FOREST])})

        expect(legend).toEqual([
            {id: 't-3', value: 1, label: 'Water -> Forest', color: defaultColor(1)},
            {id: 't-4', value: 2, ...PERMANENT_WATER},
            {id: 't-1', value: 3, label: 'Forest -> Forest', color: defaultColor(3)},
            {id: 't-2', value: 4, label: 'Forest -> Water', color: defaultColor(4)}
        ])
    })

    it('relabels the default labels of a renamed class, keeping customised ones', () => {
        const lake = {...WATER, label: 'Lake'}

        const legend = committedTransitions(saved, {...saved, fromImage: image([FOREST, lake]), toImage: image([FOREST, lake])})

        expect(legend.map(({label}) => label)).toEqual(['Forest -> Forest', 'Forest -> Lake', 'Lake -> Forest', PERMANENT_WATER.label])
    })

    it('takes a class whose value changed for a new class', () => {
        const legend = committedTransitions(saved, {...saved, toImage: image([FOREST, {...WATER, value: 5}])})

        expect(legend[0]).toEqual({id: 't-1', value: 1, label: 'Forest -> Forest', color: defaultColor(1)})
        expect(legend[3]).toEqual({id: expect.not.stringMatching(/^t-4$/), value: 4, label: 'Water -> Water', color: defaultColor(4)})
    })
})

describe('a saved transition legend its classes cannot identify', () => {
    it('gives every transition its defaults where its codes are not those its classes give', () => {
        const stale = classChange({from: [FOREST, WATER], to: [FOREST, WATER], transitions: customised(SAVED, 4, PERMANENT_WATER).slice(1)})

        const legend = committedTransitions(stale, {...stale, toImage: image([FOREST, WATER, URBAN])})

        expect(legend[4]).toEqual({id: expect.any(String), value: 5, label: 'Water -> Water', color: defaultColor(5)})
    })

    it('gives defaults to the transitions of a class whose value repeats, identifying the others', () => {
        const marsh = {id: 'marsh', value: 2, label: 'Marsh', color: '#555555'}
        const saved = classChange({from: [FOREST, WATER, marsh], to: [FOREST, WATER], transitions: [
            {id: 't-1', value: 1, label: 'Stable forest', color: '#654321'},
            {id: 't-2', value: 2, label: 'Forest -> Water', color: defaultColor(2)},
            {id: 't-3', value: 3, label: 'Water -> Forest', color: defaultColor(3)},
            {id: 't-4', value: 4, ...PERMANENT_WATER},
            {id: 't-5', value: 5, label: 'Marsh -> Forest', color: defaultColor(5)},
            {id: 't-6', value: 6, label: 'Marsh -> Water', color: defaultColor(6)}
        ]})

        const legend = committedTransitions(saved, {...saved, toImage: image([FOREST, WATER, URBAN])})

        expect(legend[0]).toEqual({id: 't-1', value: 1, label: 'Stable forest', color: '#654321'})
        expect(legend[4]).toEqual({id: expect.any(String), value: 5, label: 'Water -> Water', color: defaultColor(5)})
    })

    it('resets the customisations of a legend kept while an image had no classes, once it has them again', () => {
        const saved = classChange({from: [], to: [FOREST, WATER], transitions: customised(SAVED, 4, PERMANENT_WATER)})

        const legend = committedTransitions(saved, {...saved, fromImage: image([FOREST, WATER])})

        expect(legend[3]).toEqual({id: expect.any(String), value: 4, label: 'Water -> Water', color: defaultColor(4)})
    })
})

const FOREST = {id: 'forest', value: 1, label: 'Forest', color: '#00aa00'}
const WATER = {id: 'water', value: 2, label: 'Water', color: '#0000aa'}
const URBAN = {id: 'urban', value: 3, label: 'Urban', color: '#aa0000'}

const PERMANENT_WATER = {label: 'Permanent water', color: '#123456'}

// The transition legend the GUI has always saved for images with Forest and Water, in that order.
const SAVED = [
    {id: 't-1', value: 1, label: 'Forest -> Forest', color: defaultColor(1)},
    {id: 't-2', value: 2, label: 'Forest -> Water', color: defaultColor(2)},
    {id: 't-3', value: 3, label: 'Water -> Forest', color: defaultColor(3)},
    {id: 't-4', value: 4, label: 'Water -> Water', color: defaultColor(4)}
]

const customised = (entries, value, customisation) =>
    entries.map(entry => entry.value === value ? {...entry, ...customisation} : entry)

const image = legendEntries => ({type: 'ASSET', id: 'users/x/image', band: 'class', bands: {class: {values: [1, 2]}}, legendEntries})

// A Class Change whose images hold these classes, an image without any not yet selected, and its transition legend.
const classChange = ({from, to, transitions}) => ({
    ...(from && {fromImage: image(from)}),
    ...(to && {toImage: image(to)}),
    ...(transitions && {legend: {entries: transitions}}),
    options: {minConfidence: 0}
})
