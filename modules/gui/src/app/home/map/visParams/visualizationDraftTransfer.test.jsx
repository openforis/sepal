import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Copying a visualization panel's draft and pasting it into another's: the real panel, form, palette, legend builder,
// Combo and copy button, over a real store holding two recipes, each with a layer the editor was opened on. Only what
// lies outside them is substituted: the activation that opens an editor with its selector's context, the map's
// bounds, and Earth Engine, whose histogram and distinct-value answers a test gives when it says so.

const earthEngine = vi.hoisted(() => ({histograms: [], distinctValues: []}))
const editors = vi.hoisted(() => ({open: {}, close: () => {}}))

vi.mock('~/apiRegistry', async () => {
    const {Subject, Observable} = await import('rxjs')
    const requested = requests => args => {
        const answer$ = new Subject()
        requests.push({args, answer$})
        return answer$
    }
    return {default: {
        gee: {
            histogram$: requested(earthEngine.histograms),
            distinctBandValues$: requested(earthEngine.distinctValues)
        },
        recipe: {save$: () => new Observable(), load$: () => new Observable()}
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => [[key].flat().join('.'), ...!values || !Object.keys(values).length ? [] : [JSON.stringify(values)]].join(' ')}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}, warning: () => {}}}))
// Loading the user module here closes an import cycle through its forms; the editor reads nothing from it.
vi.mock('~/user', () => ({}))
// Panels and option lists render where they are declared, so each editor's controls are found inside its own area.
vi.mock('~/widget/portal', () => ({Portal: ({children}) => children, PortalContainer: () => null}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(text => typeof text === 'string'))}>{children}</span>
        : children
}))
// An editor is open, with the context its selector captured, until it deactivates.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => editors.open[props.area]
        ? <Component {...props} activatable={{...editors.open[props.area], deactivate: () => editors.close(props.area)}}/>
        : null
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{activatables: {legendImport: {activate: () => {}}}}}/>
}))
vi.mock('~/app/home/map/mapContext', () => ({
    withMap: () => Component => props => <Component {...props} map={{getBounds: () => [[0, 0], [1, 1]]}}/>
}))

const {Recipe} = await import('~/app/home/body/process/recipeContext')
const {productArgs} = await import('~/app/home/body/process/recipe/layerProduct')
const {VisParamsPanel} = await import('./visParamsPanel')
const {actionBuilder} = await import('~/action-builder')
const {initStore, select} = await import('~/store')
const {EventShield} = await import('~/widget/eventShield')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('a visualization draft copied', () => {
    it('is the panel\'s unsaved edits, not the applied style, and survives the panel being cancelled', async () => {
        await openEditor(A, {visParams: A_RGB})
        await typeInto(minInput(A, 0), '120')
        await typeInto(maxInput(A, 2), '')

        await copy(A)
        await click(button(A, 'button.cancel'))
        await openEditor(B)
        await paste(B)

        expect(styles(RECIPE_A)).toEqual([A_RGB, A_YEARS, A_CLASSES])
        expect(bandChoices(B)).toEqual(['red', 'green', 'blue'])
        expect(ranges(B)).toEqual([['120', '3000'], ['0', '3000'], ['0', '']])
    })

    it('carries a range that is not one, the inversion and colors that are not colors, as entered, until repaired and applied', async () => {
        await openEditor(A, {visParams: A_YEARS})
        await typeInto(minInput(A, 0), '9')
        await typeInto(maxInput(A, 0), '1')
        await click(button(A, 'REV'))
        await click(paletteHexButton(A))
        await typeInto(paletteText(A), '#ff0000, banana, #0000ff')

        await copy(A)
        await openEditor(B, {visParams: B_NIR})
        await paste(B)

        expect(ranges(B)).toEqual([['9', '1']])
        expect(paletteText(B).value).toBe('#ff0000, banana, #0000ff')
        expect(errorsOf(B, MIN)).toEqual(['map.visParams.form.min.notSmallerThanMax'])
        expect(errorsOf(B, PALETTE)).toEqual(['map.visParams.form.palette.text.invalid {"colors":"banana"}'])
        await typeInto(minInput(B, 0), '1')
        await typeInto(maxInput(B, 0), '9')
        expect(applyEnabled(B)).toBe(false)
        await pressEnter()
        expect(styles(RECIPE_B)).toEqual([B_NIR, B_YEARS])

        await typeInto(paletteText(B), '#ff0000, #00ff00, #0000ff')
        await click(button(B, 'button.apply'))

        expect(styles(RECIPE_B)[0]).toMatchObject({
            id: B_NIR.id, bands: ['red'], min: [1], max: [9], inverted: [true], palette: ['#FF0000', '#00FF00', '#0000FF']
        })
    })

    it('carries colors that are not colors in a palette\'s HEX text, which cannot be closed on them', async () => {
        await openEditor(A, {visParams: A_YEARS})
        await click(paletteHexButton(A))
        await typeInto(paletteText(A), '#ff0000, banana')

        expect(paletteHexButton(A).disabled).toBe(true)
        await copy(A)
        await openEditor(B)
        await paste(B)

        expect(paletteText(B).value).toBe('#ff0000, banana')
        expect(paletteHexButton(B).disabled).toBe(true)
        expect(applyEnabled(B)).toBe(false)
    })

    it('can be an empty one, which is not having copied nothing', async () => {
        await openEditor(A)
        expect(button(A, PASTE).disabled).toBe(true)
        expect(applyEnabled(A)).toBe(false)

        await copy(A)
        await openEditor(B, {visParams: B_NIR})
        await paste(B)

        expect(bandChoices(B)).toEqual([''])
        expect(ranges(B)).toEqual([['', '']])
        expect(applyEnabled(B)).toBe(false)
    })

    it('stays what it was when the panel it came from is edited further, and when it is pasted and edited', async () => {
        await openEditor(A, {visParams: A_RGB})
        await copy(A)
        await typeInto(minInput(A, 0), '55')
        await openEditor(B)
        await paste(B)
        await typeInto(minInput(B, 1), '66')

        await openEditor(C)
        await paste(C)

        expect(ranges(C)).toEqual([['0', '3000'], ['0', '3000'], ['0', '3000']])
    })

    it('cannot be pasted where what is held cannot be read as a draft', async () => {
        await act(async () => actionBuilder('CORRUPT').set('visualizationClipboard', {type: 'rgb', channels: [{band: 'red'}]}).dispatch())

        await openEditor(B)

        expect(button(B, PASTE).disabled).toBe(true)
    })
})

describe('a visualization draft pasted', () => {
    it('replaces only the draft: nothing is saved, selected or shown, and Cancel keeps the clipboard', async () => {
        await openEditor(A, {visParams: A_RGB})
        await copy(A)
        await openEditor(B, {visParams: B_NIR})

        await paste(B)
        await click(button(B, 'button.cancel'))

        expect(styles(RECIPE_B)).toEqual([B_NIR, B_YEARS])
        expect(applied).toEqual([])
        await openEditor(B, {visParams: B_NIR})
        expect(button(B, PASTE).disabled).toBe(false)
    })

    it('is saved by Apply as a new style the destination owns, without the source\'s value format, and reopens as saved', async () => {
        await openEditor(A, {visParams: A_YEARS})
        await copy(A)
        await openEditor(B)
        await paste(B)

        await click(button(B, 'button.apply'))

        const [saved] = styles(RECIPE_B).filter(({id}) => ![B_NIR.id, B_YEARS.id].includes(id))
        expect(saved).toMatchObject({type: 'continuous', bands: ['red'], min: [2000], max: [2025], userDefined: true})
        expect(saved.id).not.toBe(A_YEARS.id)
        expect(saved).not.toHaveProperty('dataType')
        expect(applied).toEqual([{area: B, config: {visParams: saved}}])
        await openEditor(B, {visParams: saved})
        expect(ranges(B)).toEqual([['2000', '2025']])
    })

    it('saved by Apply over a style being edited, keeps that style\'s identity and its own value format', async () => {
        await openEditor(A, {visParams: A_RGB})
        await copy(A)
        await openEditor(B, {visParams: B_YEARS})
        await paste(B)

        await click(button(B, 'button.apply'))

        expect(styles(RECIPE_B)).toEqual([
            B_NIR,
            expect.objectContaining({id: B_YEARS.id, dataType: 'fractionalYears', type: 'rgb', bands: ['red', 'green', 'blue']})
        ])
    })

    it('keeps the replacement confirmation for a style over the same bands', async () => {
        await openEditor(B, {visParams: B_NIR})
        await copy(B)
        await openEditor(B)
        await paste(B)

        await click(button(B, 'button.apply'))

        expect(styles(RECIPE_B)).toEqual([B_NIR, B_YEARS])
        expect(document.body.textContent).toContain('override the old visualization parameters')
    })

    it('keeps a category\'s value, label and color together, row order included, and is sorted by value on Apply', async () => {
        await openEditor(A, {visParams: A_CLASSES})
        await copy(A)
        await openEditor(B)

        await paste(B)
        await click(legendHexButton(B))

        expect(legendRows(B)).toEqual([['3', 'water', '#0000ff'], ['1', 'forest', '#00ff00']])
        await click(button(B, 'button.apply'))
        expect(styles(RECIPE_B)[2]).toMatchObject({
            type: 'categorical', bands: ['class'], values: [1, 3], labels: ['forest', 'water'], palette: ['#00FF00', '#0000FF']
        })
    })

    it('carries a category\'s value as it was entered, saved as the number it states', async () => {
        await openEditor(A, {visParams: A_CLASSES})
        await click(legendHexButton(A))
        await typeInto(legendInput(A, 0, 'value'), '1e3')
        expect(legendInput(A, 0, 'value').value).toBe('1e3')
        await copy(A)
        await click(button(A, 'button.cancel'))
        await openEditor(B)

        await paste(B)
        await click(legendHexButton(B))

        expect(legendRows(B)).toEqual([['1e3', 'water', '#0000ff'], ['1', 'forest', '#00ff00']])
        await click(button(B, 'button.apply'))
        expect(styles(RECIPE_B)[2]).toMatchObject({values: [1, 1000], labels: ['forest', 'water'], min: [1], max: [1000]})
    })

    it('keeps fractional category values, saving one entered as the number it states', async () => {
        await openEditor(A, {visParams: {...A_CLASSES, values: [3.5, 1.5], min: [1.5], max: [3.5]}})
        await click(legendHexButton(A))
        expect(applyEnabled(A)).toBe(true)
        await typeInto(legendInput(A, 0, 'value'), '2.25')
        await copy(A)
        await click(button(A, 'button.cancel'))
        await openEditor(B)

        await paste(B)
        await click(button(B, 'button.apply'))

        expect(styles(RECIPE_B)[2]).toMatchObject({values: [1.5, 2.25], labels: ['forest', 'water']})
    })

    it.each(['seven', 'Infinity'])('holds a category value of %s, which states no number it can draw', async value => {
        await act(async () => actionBuilder('COPY').set('visualizationClipboard', {
            type: 'categorical', band: 'class', legend: [{value, label: 'water', color: '#0000ff'}]
        }).dispatch())
        await openEditor(B)

        await paste(B)

        expect(applyEnabled(B)).toBe(false)
        await pressEnter()
        expect(styles(RECIPE_B)).toEqual([B_NIR, B_YEARS])
    })

    it('carries a cleared category value as unfinished, saving nothing until one is entered', async () => {
        await openEditor(A, {visParams: A_CLASSES})
        await click(legendHexButton(A))
        await typeInto(legendInput(A, 0, 'value'), '')
        await copy(A)
        await click(button(A, 'button.cancel'))
        await openEditor(B)

        await paste(B)
        await click(legendHexButton(B))

        expect(legendRows(B)).toEqual([['', 'water', '#0000ff'], ['1', 'forest', '#00ff00']])
        expect(applyEnabled(B)).toBe(false)
        await pressEnter()
        expect(styles(RECIPE_B)).toEqual([B_NIR, B_YEARS])
        await typeInto(legendInput(B, 0, 'value'), '1.0')
        expect(applyEnabled(B)).toBe(false)
        await typeInto(legendInput(B, 0, 'value'), '3')
        expect(applyEnabled(B)).toBe(true)
    })

    it('carries unfinished and duplicate legend rows, holding Apply until each is repaired', async () => {
        await openEditor(A, {visParams: A_CLASSES})
        await click(legendHexButton(A))
        await typeInto(legendInput(A, 0, 'color'), 'nope')
        await typeInto(legendInput(A, 1, 'label'), 'water')
        await copy(A)
        await openEditor(B)

        await paste(B)
        await click(legendHexButton(B))
        expect(legendRows(B)).toEqual([['3', 'water', 'nope'], ['1', 'water', '#00ff00']])
        expect(applyEnabled(B)).toBe(false)
        await typeInto(legendInput(B, 1, 'label'), 'forest')
        expect(applyEnabled(B)).toBe(false)
        await typeInto(legendInput(B, 0, 'color'), '#0000ff')
        expect(applyEnabled(B)).toBe(true)
    })
})

describe('a pasted band the destination cannot draw', () => {
    it('stays chosen, said so, holding Apply and Enter, and asks Earth Engine nothing of it until replaced', async () => {
        await openEditor(A, {visParams: A_RGB})
        await copy(A)
        await click(button(A, 'button.cancel'))
        await openEditor(C)
        earthEngine.histograms.length = 0

        await paste(C)

        expect(bandChoices(C)).toEqual(['red', 'green', 'blue'])
        expect(errorsOf(C, BLUE_CHANNEL)).toEqual(['map.visParams.form.band.unavailable {"band":"blue"}'])
        expect(ranges(C)).toEqual([['0', '3000'], ['0', '3000'], ['0', '3000']])
        expect(requestedBands()).toEqual(['red', 'green'])
        expect(applyEnabled(C)).toBe(false)
        await pressEnter()
        expect(styles(RECIPE_C)).toEqual([C_NIR])

        await chooseBand(C, BLUE_CHANNEL, 'nir')

        expect(errorsOf(C, BLUE_CHANNEL)).toEqual([])
        expect(requestedBands()).toEqual(['red', 'green', 'nir'])
        expect(applyEnabled(C)).toBe(true)
        await pressEnter()
        expect(styles(RECIPE_C)[1]).toMatchObject({bands: ['red', 'green', 'nir'], min: [0, 0, 0], max: [3000, 3000, 3000]})
    })

    it('is offered no distinct values for a categorical band', async () => {
        await openEditor(A, {visParams: {...A_CLASSES, bands: ['dates']}})
        await copy(A)
        await openEditor(C)

        await paste(C)

        expect(bandChoices(C)).toEqual(['dates'])
        expect(errorsOf(C, BAND)).toEqual(['map.visParams.form.band.unavailable {"band":"dates"}'])
        expect(legendEntries(C)).toHaveLength(2)
        expect(applyEnabled(C)).toBe(false)
        await chooseLoadMenuOption(C, 'map.legendBuilder.load.options.imageValues.label')
        expect(earthEngine.distinctValues).toEqual([])
    })
})

describe('what was being read for a draft a paste replaces', () => {
    it('stretches none of the pasted ranges when the histogram arrives', async () => {
        await openEditor(A, {visParams: A_RGB})
        await copy(A)
        await openEditor(B, {visParams: B_NIR})
        await chooseBand(B, BAND, 'red')
        const pending = earthEngine.histograms.filter(({args: {band}}) => band === 'red')

        await paste(B)
        await act(async () => pending.forEach(({answer$}) => answer$.next(HISTOGRAM)))
        await settled()

        expect(ranges(B)).toEqual([['0', '3000'], ['0', '3000'], ['0', '3000']])
    })

    it('stretches none of the pasted ranges over a histogram the panel had already read', async () => {
        await openEditor(A, {visParams: A_YEARS})
        await copy(A)
        await click(button(A, 'button.cancel'))
        await openEditor(B, {visParams: B_NIR})
        await chooseBand(B, BAND, 'red')
        await answerHistograms('red')
        expect(ranges(B)).toEqual([['10', '30']])
        await chooseBand(B, BAND, 'nir')

        await paste(B)

        expect(ranges(B)).toEqual([['2000', '2025']])
    })

    it('leaves the pasted legend when the distinct values arrive', async () => {
        await openEditor(A, {visParams: A_CLASSES})
        await copy(A)
        await openEditor(B, {visParams: {...B_NIR, type: 'categorical', bands: ['class'], values: [7], labels: ['seven'], palette: ['#123456']}})
        await chooseLoadMenuOption(B, 'map.legendBuilder.load.options.imageValues.label')
        const [pending] = earthEngine.distinctValues

        await paste(B)
        await act(async () => pending.answer$.next([4, 5, 6]))
        await settled()
        await click(legendHexButton(B))

        expect(legendRows(B)).toEqual([['3', 'water', '#0000ff'], ['1', 'forest', '#00ff00']])
    })
})

const SOURCE = 'this-recipe'
const RECIPE_A = 'recipe-a'
const RECIPE_B = 'recipe-b'
const RECIPE_C = 'recipe-c'
const A = 'a'
const B = 'b'
const C = 'c'
const PASTE = 'paste'
const MIN = 'map.visParams.form.min.label'
const MAX = 'map.visParams.form.max.label'
const BAND = 'map.visParams.form.band.band.label'
const BLUE_CHANNEL = 'map.visParams.form.band.blueChannel.label'
const PALETTE = 'map.visParams.form.palette.label'
const HISTOGRAM = [[10, 5], [20, 5], [30, 5]]

const A_RGB = {
    id: 'a-rgb', type: 'rgb', bands: ['red', 'green', 'blue'], min: [0, 0, 0], max: [3000, 3000, 3000],
    gamma: [1, 1, 1], inverted: [false, false, false], userDefined: true
}
const A_YEARS = {
    id: 'a-years', type: 'continuous', bands: ['red'], min: [2000], max: [2025], inverted: [false],
    palette: ['#000000', '#ffffff'], dataType: 'fractionalYears', userDefined: true
}
const A_CLASSES = {
    id: 'a-classes', type: 'categorical', bands: ['class'], values: [3, 1], labels: ['water', 'forest'],
    palette: ['#0000ff', '#00ff00'], min: [1], max: [3], inverted: [false], userDefined: true
}
const B_NIR = {
    id: 'b-nir', type: 'continuous', bands: ['nir'], min: [0], max: [5000], inverted: [false], palette: ['#000000', '#00ff00'],
    userDefined: true
}
const C_NIR = {...B_NIR, id: 'c-nir'}
const B_YEARS = {
    id: 'b-years', type: 'continuous', bands: ['green'], min: [1990], max: [2020], inverted: [false],
    palette: ['#000000', '#ffffff'], dataType: 'fractionalYears', userDefined: true
}

// Each area shows its recipe's own output; a recipe's layer can draw these bands. C's has no blue.
const AREAS = {
    [A]: {recipeId: RECIPE_A, bands: ['red', 'green', 'blue', 'class', 'dates']},
    [B]: {recipeId: RECIPE_B, bands: ['red', 'green', 'blue', 'nir', 'class']},
    [C]: {recipeId: RECIPE_C, bands: ['red', 'green', 'nir', 'class']}
}

const recipe = (id, visualizations, areas) => ({
    id, type: 'MOSAIC', revision: 1, model: {aoi: {type: 'COUNTRY', countryCode: id}}, ui: {initialized: true},
    layers: {
        userDefinedVisualizations: {[SOURCE]: visualizations},
        areas: Object.fromEntries(areas.map(area => [area, {imageLayer: {sourceId: SOURCE, layerConfig: {visParams: visualizations[0]}}}]))
    }
})

let root, container, store, rerender, applied

beforeEach(async () => {
    earthEngine.histograms.length = 0
    earthEngine.distinctValues.length = 0
    applied = []
    editors.open = {}
    editors.close = area => {
        delete editors.open[area]
        rerender()
    }
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [RECIPE_A]: recipe(RECIPE_A, [A_RGB, A_YEARS, A_CLASSES], [A]),
                [RECIPE_B]: recipe(RECIPE_B, [B_NIR, B_YEARS], [B]),
                [RECIPE_C]: recipe(RECIPE_C, [C_NIR], [C])
            },
            recipes: [], saveStates: {}, folders: [], tabs: [{id: RECIPE_A}, {id: RECIPE_B}, {id: RECIPE_C}]
        },
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}><EventShield><Editors/></EventShield></Provider>))
})

afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

const Editors = () => {
    const [, update] = React.useReducer(count => count + 1, 0)
    rerender = update
    return Object.keys(editors.open).map(area =>
        <div key={area} data-area={area}>
            <Recipe id={AREAS[area].recipeId}>
                <VisParamsPanel area={area} updateLayerConfig={config => applied.push({area, config})}/>
            </Recipe>
        </div>
    )
}

// The editor of an area, opened as its selector opens it: adding a style, or editing the one given.
async function openEditor(area, {visParams} = {}) {
    if (editors.open[area]) {
        await act(async () => editors.close(area))
    }
    const {recipeId, bands} = AREAS[area]
    const shown = select(['process.loadedRecipes', recipeId])
    const layerConfig = shown.layers.areas[area].imageLayer.layerConfig
    editors.open[area] = {recipe: shown, imageLayerSourceId: SOURCE, bands, productArgs: productArgs(shown, layerConfig), visParams}
    await act(async () => rerender())
    await settled()
}

const styles = recipeId => select(['process.loadedRecipes', recipeId, 'layers.userDefinedVisualizations', SOURCE])

const panelOf = area => container.querySelector(`[data-area="${area}"]`)

const field = (area, label, index = 0) => panelOf(area).querySelectorAll(`[data-label="${label}"]`)[index]

const button = (area, label) => [...panelOf(area).querySelectorAll('button')]
    .find(element => element.textContent === label || element.querySelector(`[data-icon="${label}"]`))

const applyEnabled = area => button(area, 'button.apply').disabled === false

const copy = area => click(button(area, 'copy'))

const paste = area => click(button(area, PASTE))

const minInput = (area, channel) => field(area, MIN, channel).querySelector('input')

const maxInput = (area, channel) => field(area, MAX, channel).querySelector('input')

// Each channel's min and max as its inputs show them.
const ranges = area => [...panelOf(area).querySelectorAll(`[data-label="${MIN}"]`)].map((minField, channel) => [
    minField.querySelector('input').value,
    maxInput(area, channel).value
])

// Each channel's band as its Combo shows it chosen.
const bandChoices = area => [...panelOf(area).querySelectorAll('[data-label$="Channel.label"], [data-label$="hue.label"], [data-label="' + BAND + '"]')]
    .map(element => element.querySelector('input').placeholder.replace('map.visParams.form.band.select.placeholder', ''))

const paletteHexButton = area => [...field(area, 'map.visParams.form.palette.label').querySelectorAll('button')]
    .find(button => button.textContent === 'HEX')

const paletteText = area => field(area, 'map.visParams.form.palette.label').querySelector('textarea')

const legendHexButton = area => field(area, 'map.legendBuilder.label').querySelector('button')

const legendEntries = area => [...field(area, 'map.legendBuilder.label').querySelectorAll('[class*="_entry_"]')]

const legendInput = (area, row, name) => {
    const inputs = [...legendEntries(area)[row].querySelectorAll('input')]
    const byName = inputs.length === 3 ? {color: inputs[0], value: inputs[1], label: inputs[2]} : {value: inputs[0], label: inputs[1]}
    return byName[name]
}

// Each legend row's value, label and color, as its inputs show them with the HEX codes shown.
const legendRows = area => legendEntries(area).map((_entry, row) => ['value', 'label', 'color']
    .map(name => legendInput(area, row, name).value))

const errorsOf = (area, label) => {
    const tooltip = field(area, label)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const requestedBands = () => earthEngine.histograms.map(({args: {band}}) => band)

async function answerHistograms(band) {
    await act(async () => earthEngine.histograms
        .filter(({args}) => args.band === band)
        .forEach(({answer$}) => answer$.next(HISTOGRAM)))
    await settled()
}

async function chooseBand(area, label, band) {
    await click(field(area, label).querySelector('input'))
    const option = [...field(area, label).querySelectorAll('li')]
        .map(item => item.firstElementChild)
        .find(element => element?.textContent === band)
    await click(option)
}

// The option of the legend's Add menu labelled so.
async function chooseLoadMenuOption(area, label) {
    await click(button(area, 'button.add').parentElement.querySelectorAll('button')[1])
    const option = [...panelOf(area).querySelectorAll('li')]
        .map(item => item.firstElementChild)
        .find(element => element?.textContent === label)
    await click(option)
}

async function pressEnter() {
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
    await settled()
}

async function typeInto(input, text) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function click(element) {
    expect(element).toBeDefined()
    await act(async () => element.click())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
