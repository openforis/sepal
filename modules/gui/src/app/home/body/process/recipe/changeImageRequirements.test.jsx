import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// What Class Change and Index Change say of an image whose selection their output read refuses (changeImageRequirements.js):
// its section's toolbar button marks it, Retrieve is refused and previews withdrawn, naming the section, while the panel
// editing the image keeps what was saved and says beside each field what it lacks, until a repair is applied. What is not
// established - a source still being read, or one that could not be - refuses nothing. The real toolbars and image
// panels over a real store and source runtime; Earth Engine and recipe storage answer when a test says so.

const fake = vi.hoisted(() => ({requests: [], records: {}, missingAssets: new Set(), versionsHeld: false}))
vi.mock('~/apiRegistry', async () => {
    const {map, NEVER, of, Subject, throwError} = await import('rxjs')
    const request = key => {
        const answer$ = new Subject()
        fake.requests.push({key, answer$})
        return answer$
    }
    return {default: {
        recipe: {
            save$: () => NEVER,
            // A record a test does not hold is answered when the test says so.
            load$: id => !(id in fake.records) ? request(`load:${id}`)
                : fake.records[id] instanceof Error ? throwError(() => fake.records[id]) : of(fake.records[id]),
            loadAll$: () => of(LISTING)
        },
        gee: {
            assetMetadata$: ({asset}) => request(`metadata:${asset}`),
            // Asset versions are answered at once, unless a test holds them until it says.
            assetVersions$: ({ids}) => (fake.versionsHeld ? request('versions') : of(true)).pipe(map(() => ({assets: ids.map(id =>
                fake.missingAssets.has(id) ? {id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}} : {id, type: 'IMAGE', version: 'v1'}
            )}))),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            bands$: ({asset, recipe}) => request(`bands:${asset || recipe.id}`)
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : `${key}`}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// The panels a test opens are open until applied or cancelled; no other is.
const panels = vi.hoisted(() => ({open: new Set()}))
vi.mock('~/widget/activation/activatable', async () => {
    const React = await import('react')
    return {
        withActivatable: ({id}) => Component => class extends React.Component {
            state = {active: true}

            render() {
                return panels.open.has(id) && this.state.active
                    ? <Component {...this.props} activatable={{
                        active: true, activate: () => this.setState({active: true}), deactivate: () => this.setState({active: false})
                    }}/>
                    : null
            }
        }
    }
})
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classChange} = await import('./classChange/classChange')
const {default: indexChange} = await import('./indexChange/indexChange')
const {ClassChangeToolbar} = await import('./classChange/panels/classChangeToolbar')
const {IndexChangeToolbar} = await import('./indexChange/panels/indexChangeToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {retrieveAvailability} = await import('./operationAvailability')
const {readRetrieveOutput} = await import('./retrieveOutput')
const {readOutputRequirements, requestGate} = await import('./sourceRequirements')
const {sourceProblemsOfState} = await import('./selectedSourceStatus')

addRecipeType(classChange())
addRecipeType(indexChange())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'change-1'
const FROM = 'users/x/from'
const TO = 'users/x/to'
const LISTING = [{id: ID, name: 'Change', type: 'CLASS_CHANGE', revision: 1}, {id: 'upstream-1', name: 'Upstream', type: 'CLASS_CHANGE', revision: 1}]

let root, store, runtime

beforeEach(() => {
    fake.requests = []
    fake.records = {}
    fake.missingAssets = new Set()
    fake.versionsHeld = false
    panels.open.clear()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

const RECIPES = [
    ['CLASS_CHANGE', 'classChange', () => ClassChangeToolbar],
    ['INDEX_CHANGE', 'indexChange', () => IndexChangeToolbar]
]

describe.each(RECIPES)('a %s image whose source no longer provides its band', (type, name, toolbar) => {
    const FROM_SECTION = `process.${name}.panel.inputImage.from.button.label`

    it('marks its section, refuses Retrieve and withdraws previews, naming that section; the other image is not marked', async () => {
        await open(toolbar(), recipeOf(type))

        await answer({[`bands:${FROM}`]: ['other'], [`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.unavailableBands')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(retrieveRead().output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: FROM_SECTION}])
        expect(previewGate()).toMatchObject({withdraw: true, section: FROM_SECTION})
    })

    it('refuses nothing while its source is read, nor once the read fails', async () => {
        await open(toolbar(), recipeOf(type))
        expect(sectionMark('fromImage')).toBeNull()
        expect(previewGate()).toMatchObject({wait: true, withdraw: false})

        await answer({[`bands:${FROM}`]: new Error('Earth Engine unreachable'), [`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBeNull()
        expect(previewGate()).toMatchObject({withdraw: false})
    })

    it('keeps the saved band in its editor, refused beside its field, until one the source provides is applied', async () => {
        await open(toolbar(), recipeOf(type), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['other']), [`bands:${FROM}`]: ['other'], [`bands:${TO}`]: ['band']})

        expect(fieldValue(BAND_FIELD[name])).toBe('band')
        expect(fieldErrors(BAND_FIELD[name])).toEqual([expect.stringContaining('process.requirement.inputImage.field.unavailableBand')])
        expect(applyEnabled()).toBe(false)

        await choose(BAND_FIELD[name], 'other')
        expect(fieldErrors(BAND_FIELD[name])).toEqual([])
        expect(retrieveAvailable()).toBe(false)
        await apply()

        expect(model().fromImage.band).toBe('other')
        expect(sectionMark('fromImage')).toBeNull()
        expect(retrieveAvailable()).toBe(true)
    })

    it('is left as saved when an edit is cancelled', async () => {
        const recipe = recipeOf(type)
        await open(toolbar(), recipe, ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['other']), [`bands:${FROM}`]: ['other'], [`bands:${TO}`]: ['band']})

        await choose(BAND_FIELD[name], 'other')
        await cancel()

        expect(model()).toEqual(recipe.model)
        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.unavailableBands')
    })

    it('keeps its saved band, offered, while its source is read again and when that read fails', async () => {
        await open(toolbar(), recipeOf(type), ['fromImage'])
        expect(fieldValue(BAND_FIELD[name])).toBe('band')

        await answer({[`metadata:${FROM}`]: new Error('Earth Engine unreachable')})

        expect(fieldValue(BAND_FIELD[name])).toBe('band')
        expect(model()).toEqual(recipeOf(type).model)
    })
})

describe('an INDEX_CHANGE image whose source no longer provides its error band', () => {
    it('marks its section, and its editor refuses the error band beside its field alone', async () => {
        const recipe = recipeOf('INDEX_CHANGE', {toImage: {...IMAGE(TO, 'INDEX_CHANGE'), errorBand: 'rmse'}})
        await open(IndexChangeToolbar, recipe, ['toImage'])

        await answer({[`metadata:${TO}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        expect(sectionMark('toImage')).toBe('process.requirement.inputImage.unavailableBands')
        expect(fieldValue(ERROR_BAND_FIELD)).toBe('rmse')
        expect(fieldErrors(ERROR_BAND_FIELD)).toEqual([expect.stringContaining('process.requirement.inputImage.field.unavailableBand')])
        expect(fieldErrors(BAND_FIELD.indexChange)).toEqual([])
    })
})

describe('a CLASS_CHANGE image selecting a recipe storage no longer holds', () => {
    it('marks its section, refuses Retrieve and withdraws previews, and its editor keeps the selection, saying so', async () => {
        fake.records['deleted-1'] = notFound()
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'}}), ['fromImage'])

        await answer({[`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: 'process.classChange.panel.inputImage.from.button.label'})
        expect(fieldValue(RECIPE_FIELD)).toBe('widget.recipeInput.unlisted')
        expect(fieldErrors(RECIPE_FIELD)).toEqual(['process.requirement.inputImage.field.missingRecipe'])
    })

    it('is not marked, nor its previews withdrawn, where the recipe could not be read for another reason, which its editor says', async () => {
        fake.records['deleted-1'] = Object.assign(new Error('Service unavailable'), {status: 503})
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'}}), ['fromImage'])

        await answer({[`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: false})
        expect(fieldErrors(RECIPE_FIELD)).toEqual(['widget.recipeInput.loadError'])
    })
})

// Both images select recipes, read together: only the one whose own read is answered not there is marked; the other
// stays unknown. A failed read ends the others, so a recipe whose read another's failure ended is not known missing.
describe('a CLASS_CHANGE image whose recipe is gone, beside another selecting a recipe', () => {
    const FROM_SECTION = 'process.classChange.panel.inputImage.from.button.label'
    const BOTH = {
        fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'},
        toImage: {...IMAGE(TO), type: 'RECIPE_REF', id: 'other-1'}
    }

    it('alone is marked while the other is still being read', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', BOTH))

        await answer({'load:deleted-1': notFound()})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: FROM_SECTION})
    })

    it('alone is marked where the other then fails for a reason that may not repeat', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', BOTH))

        await answer({'load:deleted-1': notFound()})
        await answer({'load:other-1': unavailable()})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: FROM_SECTION})
    })

    it('is not marked, nor is the other, where the other first fails for a reason that may not repeat', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', BOTH))

        await answer({'load:other-1': unavailable()})
        await answer({'load:deleted-1': notFound()})

        expect(sectionMark('fromImage')).toBeNull()
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: false})
    })
})

describe('a CLASS_CHANGE image selecting an asset found missing', () => {
    it('marks its section, refuses Retrieve and withdraws previews, and its editor says so beside the asset', async () => {
        fake.missingAssets.add(FROM)
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE'), ['fromImage'])

        await answer({[`metadata:${FROM}`]: new Error(`Asset not found: ${FROM}`), [`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingAsset')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: 'process.classChange.panel.inputImage.from.button.label'})
        expect(fieldErrors(ASSET_FIELD)).toContain('process.requirement.inputImage.field.missingAsset')
    })
})

describe('a CLASS_CHANGE image whose recipe is gone, beside one selecting an asset found missing', () => {
    it.each([
        ['the asset', 'fromImage', () => answer({'load:deleted-1': notFound()}), () => answer({versions: true})],
        ['the recipe', 'toImage', () => answer({versions: true}), () => answer({'load:deleted-1': notFound()})]
    ])('both are marked, %s found missing last', async (_last, foundFirst, first, last) => {
        fake.versionsHeld = true
        fake.missingAssets.add(TO)
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'}}))
        await first()
        expect(['fromImage', 'toImage'].filter(id => sectionMark(id))).toEqual([foundFirst])

        await last()

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(sectionMark('toImage')).toBe('process.requirement.inputImage.missingAsset')
        expect(retrieveAvailable()).toBe(false)
    })
})

// A source the user selects in place of the saved one: what was chosen of the saved source is kept where the new one
// provides it, and otherwise cleared without saying so, as a field never filled is. A broken saved selection still says
// what it lacks at once (above).
describe.each(RECIPES)('a %s image whose source is replaced', (type, name, toolbar) => {
    it('keeps its band where the new source provides it, the saved recipe as it was until applied', async () => {
        const recipe = recipeOf(type)
        await open(toolbar(), recipe, ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        await chooseAsset(NEW, name)
        await answer({[`metadata:${NEW}`]: metadata(['band', 'other']), [`bands:${NEW}`]: ['band', 'other']})

        expect(fieldValue(BAND_FIELD[name])).toBe('band')
        expect(errorsOf(BAND_FIELD[name])).toEqual([])
        expect(model()).toEqual(recipe.model)
        await apply()
        expect(model().fromImage).toMatchObject({id: NEW, band: 'band'})
    })

    it('clears its band, without saying so, where the new source lacks it; Apply stays held', async () => {
        const recipe = recipeOf(type)
        await open(toolbar(), recipe, ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        await chooseAsset(NEW, name)
        await answer({[`metadata:${NEW}`]: metadata(['other']), [`bands:${NEW}`]: ['other']})

        expect(fieldValue(BAND_FIELD[name])).toBe('')
        expect(errorsOf(BAND_FIELD[name])).toEqual([])
        if (type === 'CLASS_CHANGE') {
            expect(legendErrors()).toEqual([])
        }
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(recipe.model)
    })

    it('starts the selector of the other kind focused and neutral, with nothing of the saved source', async () => {
        await open(toolbar(), recipeOf(type), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        await switchKind('RECIPE')

        expect(field(IMAGE_FIELD[name]).contains(document.activeElement)).toBe(true)
        expect(errorsOf(IMAGE_FIELD[name])).toEqual([])
        expect(fieldValue(BAND_FIELD[name])).toBe('')
        expect(errorsOf(BAND_FIELD[name])).toEqual([])
        if (type === 'CLASS_CHANGE') {
            expect(legendErrors()).toEqual([])
        }
        expect(applyEnabled()).toBe(false)
    })
})

describe('an INDEX_CHANGE to image whose band the new source lacks', () => {
    // The from image's band is the default only for a band not yet chosen, not a substitute for one cleared.
    it('is cleared, not replaced by the from image\'s band the new source provides', async () => {
        await open(IndexChangeToolbar, recipeOf('INDEX_CHANGE', {toImage: {...IMAGE(TO, 'INDEX_CHANGE'), band: 'old', bands: ['old']}}), ['toImage'])
        await answer({[`metadata:${TO}`]: metadata(['old']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['old']})

        await chooseAsset(NEW, 'indexChange')
        await answer({[`metadata:${NEW}`]: metadata(['band']), [`bands:${NEW}`]: ['band']})

        expect(fieldValue(BAND_FIELD.indexChange)).toBe('')
        expect(errorsOf(BAND_FIELD.indexChange)).toEqual([])
        expect(applyEnabled()).toBe(false)
    })

    it('takes the from image\'s band where a new to image\'s source provides it', async () => {
        const {toImage: _toImage, ...model} = recipeOf('INDEX_CHANGE').model
        await open(IndexChangeToolbar, {...recipeOf('INDEX_CHANGE'), model}, ['toImage'])
        await answer({[`bands:${FROM}`]: ['band']})

        await chooseAsset(NEW, 'indexChange')
        await answer({[`metadata:${NEW}`]: metadata(['other', 'band']), [`bands:${NEW}`]: ['other', 'band']})

        expect(fieldValue(BAND_FIELD.indexChange)).toBe('band')
    })
})

// A band cleared as one a new source lacks is the user's to choose again: no later source fills it, until the source
// kind starts over.
describe('a CLASS_CHANGE image whose band a new source cleared', () => {
    it('stays without a band when yet another source is selected', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE'), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})
        await chooseAsset(NEW)
        await answer({[`metadata:${NEW}`]: metadata(['other']), [`bands:${NEW}`]: ['other']})

        await chooseAsset(ANOTHER)
        await answer({[`metadata:${ANOTHER}`]: metadata(['classes']), [`bands:${ANOTHER}`]: ['classes']})

        expect(fieldValue(BAND_FIELD.classChange)).toBe('')
        expect(errorsOf(BAND_FIELD.classChange)).toEqual([])
        expect(applyEnabled()).toBe(false)
    })

    it('takes the initial default again once the source kind starts over', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE'), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})
        await chooseAsset(NEW)
        await answer({[`metadata:${NEW}`]: metadata(['other']), [`bands:${NEW}`]: ['other']})

        await switchKind('RECIPE')
        await switchKind('ASSET')
        await chooseAsset(ANOTHER)
        await answer({[`metadata:${ANOTHER}`]: metadata(['classes']), [`bands:${ANOTHER}`]: ['classes']})

        expect(fieldValue(BAND_FIELD.classChange)).toBe('classes')
    })
})

describe('an INDEX_CHANGE image whose error band a new source lacks, after its band was chosen', () => {
    it('is cleared, not replaced by the chosen band\'s default error band', async () => {
        await open(IndexChangeToolbar, recipeOf('INDEX_CHANGE', {
            fromImage: {...IMAGE(FROM, 'INDEX_CHANGE'), bands: ['band', 'chosen', 'err'], errorBand: 'err'}
        }), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band', 'chosen', 'err']), [`bands:${FROM}`]: ['band', 'chosen', 'err'], [`bands:${TO}`]: ['band']})
        await choose(BAND_FIELD.indexChange, 'chosen')
        expect(fieldValue(ERROR_BAND_FIELD)).toBe('err')

        await chooseAsset(NEW, 'indexChange')
        await answer({[`metadata:${NEW}`]: metadata(['chosen', 'chosen_rmse']), [`bands:${NEW}`]: ['chosen', 'chosen_rmse']})

        expect(fieldValue(BAND_FIELD.indexChange)).toBe('chosen')
        expect(fieldValue(ERROR_BAND_FIELD)).toBe('')
        expect(errorsOf(ERROR_BAND_FIELD)).toEqual([])
    })
})

describe('an INDEX_CHANGE image whose source is replaced by one without its error band', () => {
    it('clears the error band without saying so, keeping its band', async () => {
        await open(IndexChangeToolbar, recipeOf('INDEX_CHANGE', {fromImage: {...IMAGE(FROM, 'INDEX_CHANGE'), errorBand: 'rmse'}}), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band', 'rmse']), [`bands:${FROM}`]: ['band', 'rmse'], [`bands:${TO}`]: ['band']})

        await chooseAsset(NEW, 'indexChange')
        await answer({[`metadata:${NEW}`]: metadata(['band']), [`bands:${NEW}`]: ['band']})

        expect(fieldValue(BAND_FIELD.indexChange)).toBe('band')
        expect(fieldValue(ERROR_BAND_FIELD)).toBe('')
        expect(errorsOf(ERROR_BAND_FIELD)).toEqual([])
        await apply()
        expect(model().fromImage).toMatchObject({id: NEW, band: 'band'})
        expect(model().fromImage.errorBand).toBeFalsy()
    })
})

// Execution codes transitions from each image's legend (lib/js/shared/src/recipe/type/classChange.js).
describe('a CLASS_CHANGE image without a legend', () => {
    const TO_SECTION = 'process.classChange.panel.inputImage.to.button.label'
    const withoutToLegend = () => recipeOf('CLASS_CHANGE', {toImage: {...IMAGE(TO), legendEntries: []}})

    it('marks its section, refuses Retrieve and withdraws previews, naming that section; the other image is not marked', async () => {
        await open(ClassChangeToolbar, withoutToLegend())

        await answer({[`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        expect(sectionMark('toImage')).toBe(LEGEND_MISSING)
        expect(sectionMark('fromImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(retrieveRead().output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: TO_SECTION}])
        expect(previewGate()).toMatchObject({withdraw: true, section: TO_SECTION})
    })

    it('says so beside the legend in its editor, and is unmarked once a draft with classes is applied', async () => {
        const saved = withoutToLegend()
        await open(ClassChangeToolbar, saved, ['toImage'])
        await answer({[`metadata:${TO}`]: metadata(['band', 'other']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band', 'other']})
        expect(legendErrors()).toEqual([LEGEND_REQUIRED])
        expect(model()).toEqual(saved.model)

        await choose(BAND_FIELD.classChange, 'other')
        expect(legendErrors()).toEqual([])
        expect(sectionMark('toImage')).toBe(LEGEND_MISSING)
        expect(retrieveAvailable()).toBe(false)
        await apply()

        expect(model().toImage.legendEntries.map(({value}) => value)).toEqual([1, 2])
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(true)
    })

    // A legend the draft leaves empty is work not yet done, said by the legend's own rule once it is interacted with.
    it('is not said beside a legend a draft leaves empty by choosing a band without classes; Apply stays held', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE'), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        await chooseAsset(NEW)
        await answer({[`metadata:${NEW}`]: {...metadata(['other']), properties: {}}, [`bands:${NEW}`]: ['other']})
        await choose(BAND_FIELD.classChange, 'other')

        expect(fieldValue(BAND_FIELD.classChange)).toBe('other')
        expect(legendErrors()).toEqual([])
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(recipeOf('CLASS_CHANGE').model)
    })

    it('is neither marked nor said beside its legend when a set-up wizard arrives at it', async () => {
        const {fromImage: _fromImage, toImage: _toImage, ...model} = recipeOf('CLASS_CHANGE').model
        await open(ClassChangeToolbar, {...recipeOf('CLASS_CHANGE'), ui: {initialized: false}, model}, ['fromImage'])

        expect(sectionMark('fromImage')).toBeNull()
        expect(legendErrors()).toEqual([])
        expect(panelButton('button.done').disabled).toBe(true)
    })
})

describe('a missing recipe found in a CLASS_CHANGE recipe\'s closure', () => {
    it('is that recipe\'s own where its own edge names it, and the recipe it lies under\'s otherwise', () => {
        const recipe = recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'upstream-1'}})

        const own = reads(recipe, missing([ID, 'upstream-1'], ['model', 'fromImage'], 'FROM_IMAGE', 'upstream-1'))
        const upstream = reads(recipe, missing([ID, 'upstream-1', 'deleted-1'], ['model', 'fromImage'], 'FROM_IMAGE', 'deleted-1'))
        const elsewhere = reads(recipe, missing([ID, 'upstream-1'], ['model', 'toImage'], 'FROM_IMAGE', 'upstream-1'))
        const otherFailed = reads(recipe, missing([ID, 'upstream-1'], ['model', 'fromImage'], 'FROM_IMAGE', 'another-1'))

        expect(attributed(own)).toEqual(['fromImage'])
        expect(attributed(upstream)).toEqual([])
        expect(attributed(elsewhere)).toEqual([])
        expect(attributed(otherFailed)).toEqual([])
        expect([own, upstream, elsewhere, otherFailed].flat().every(({item, outputState}) => item || outputState)).toBe(true)
    })
})

const BAND_FIELD = {
    classChange: 'process.classChange.panel.inputImage.changeBand.label',
    indexChange: 'process.indexChange.panel.inputImage.changeBand.label'
}
const LEGEND_FIELD = 'process.classChange.panel.inputImage.legend.label'
const LEGEND_MISSING = 'process.classChange.panel.inputImage.legend.missing'
const LEGEND_REQUIRED = 'process.classChange.panel.inputImage.legend.required'
const IMAGE_FIELD = {
    classChange: 'process.classChange.panel.inputImage.image.label',
    indexChange: 'process.indexChange.panel.inputImage.image.label'
}
const ERROR_BAND_FIELD = 'process.indexChange.panel.inputImage.errorBand.label'
const RECIPE_FIELD = 'process.classChange.panel.inputImage.image.label'
const ASSET_FIELD = RECIPE_FIELD

const NEW = 'users/x/new'
const ANOTHER = 'users/x/another'

const LEGEND = [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]

// An image as each type saves it: Class Change keeps its source's bands with their styles, and a legend; Index Change
// keeps their names.
const IMAGE = (id, type = 'CLASS_CHANGE') => type === 'CLASS_CHANGE'
    ? {type: 'ASSET', id, band: 'band', bands: {band: {values: [1, 2]}}, legendEntries: LEGEND}
    : {type: 'ASSET', id, band: 'band', bands: ['band']}

const recipeOf = (type, model = {}) => ({
    id: ID,
    type,
    revision: 1,
    ui: {initialized: true},
    model: {
        fromImage: IMAGE(FROM, type),
        toImage: IMAGE(TO, type),
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        legend: {entries: []},
        options: {minConfidence: 0},
        ...model
    }
})

const notFound = () => Object.assign(new Error('Not found'), {status: 404})

const unavailable = () => Object.assign(new Error('Service unavailable'), {status: 503})

// An asset's metadata: its bands, each a classification with two classes.
const metadata = bands => ({
    type: 'Image',
    bandNames: bands,
    bands: bands.map(id => ({id, data_type: {type: 'PixelType', precision: 'int'}})),
    properties: Object.fromEntries(bands.flatMap(band => [
        [`${band}_class_names`, ['A', 'B']], [`${band}_class_values`, [1, 2]], [`${band}_class_palette`, ['#000000', '#ffffff']]
    ]))
})

// An output read as a recipe whose record is gone leaves it: unreadable, its closure missing that record, the read that
// failed naming the record it could not read.
const missing = (recipePath, path, role, failedRecipe) => ({
    status: 'UNAVAILABLE',
    diagnostics: [],
    error: Object.assign(notFound(), {recipeId: failedRecipe}),
    dependencyValidity: {status: 'UNAVAILABLE', diagnostics: [{code: 'MISSING_SOURCE', role, path, recipePath}]}
})

const reads = (recipe, output) => readOutputRequirements({recipe, output})

// The items the reads claim the finding for; every other read is held by the output's own state.
const attributed = reads => reads.filter(({item}) => item).map(({item}) => item.id)

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(Toolbar, recipe, openPanels = []) {
    openPanels.forEach(id => panels.open.add(id))
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [{id: ID}]
        },
        assets: {user: [NEW, ANOTHER].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ID}>
                    <Runtime/>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <Toolbar/>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// Answers every request still waiting under each key: a source's bands, or an Error it fails with.
async function answer(answers) {
    await act(async () => fake.requests
        .filter(({key, answer$}) => key in answers && !answer$.isStopped)
        .forEach(({key, answer$}) => {
            const value = answers[key]
            if (value instanceof Error) {
                answer$.error(value)
            } else {
                answer$.next(key.startsWith('bands:') ? value.map(name => ({name, arrayDimensions: 0})) : value)
                answer$.complete()
            }
        }))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const recipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const retrieveAvailable = () => retrieveAvailability({
    state: store.getState(), recipe: recipe(), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()
}).available

const retrieveRead = () => readRetrieveOutput({
    state: store.getState(), recipeId: ID, heldFor: key => runtime.heldFor(key), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id)
})

// Why a new preview of the recipe may not be requested, as a layer showing it asks, on this map or another.
const previewGate = () => requestGate({
    state: store.getState(), recipe: recipe(), operation: 'IMAGE_OUTPUT',
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()
})

// What a section's toolbar button says of it while marking it - the section's problem it shows as its tooltip - or null
// where it is not marked.
const sectionMark = id => {
    const button = [...document.querySelectorAll('button')]
        .find(button => button.textContent.includes(`.panel.inputImage.${id === 'fromImage' ? 'from' : 'to'}.button.label`))
    return button.classList.contains(toolbarButtonStyles.error)
        ? sourceProblemsOfState(store.getState(), ID, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key))[id]
        : null
}

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field shows selected: a combo shows its selection in place of its placeholder.
const fieldValue = label => {
    const input = field(label).querySelector('input')
    return input.value || (field(label).querySelector('[class*="fakePlaceholder"]') ? input.placeholder : '')
}

// What a field's own feedback says is wrong with it.
const fieldErrors = label => [...field(label).querySelectorAll('[data-tooltip]')]
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .filter(line => line.startsWith('process.requirement') || line.endsWith('.loadError'))

// What the legend's label says of it as errors: the tooltip of the icon marking them.
const legendErrors = () => errorsOf(LEGEND_FIELD)

// What a field's label says of it as errors, its own and its requirements' alike.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

// Another asset chosen in the image's picker, by typing its id and picking it.
const chooseAsset = async (asset, name = 'classChange') => {
    const input = field(IMAGE_FIELD[name]).querySelector('input')
    await act(async () => input.click())
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, asset)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
    await act(async () => options().find(option => option.textContent.includes(asset)).click())
    await settled()
}

const switchKind = async kind => {
    await act(async () => panelButton(`process.sourceType.${kind}`).click())
    await settled()
}

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

const choose = async (label, value) => {
    await act(async () => field(label).querySelector('input').click())
    await settled()
    await act(async () => options().find(element => element.textContent === value).click())
    await settled()
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const applyEnabled = () => panelButton('button.apply')?.disabled === false

const apply = async () => {
    await act(async () => panelButton('button.apply').click())
    await settled()
}

const cancel = async () => {
    await act(async () => panelButton('button.cancel').click())
    await settled()
}
