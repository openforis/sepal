import {act, useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {isObservable, of, ReplaySubject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Retrieving through Masking the way a user does: the bands the panel's own output resolution describes are
// shown by the real band control, clicked, and applied through the real Retrieve panel, form and submission.
// Earth Engine, recipe reads, task submission and panel activation are the substitutes; the asset destination
// widget, which checks Earth Engine, is not rendered.

const submitted = vi.hoisted(() => [])
const geeReads = vi.hoisted(() => [])
// What Earth Engine answers for a band request, where the scenario needs one observed.
const observed = vi.hoisted(() => ({answer: null}))

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: args => {
            geeReads.push(args)
            const answer = observed.answer?.(args)
            if (!answer) {
                return throwError(() => new Error('Earth Engine is not observed here'))
            }
            // A scenario that controls WHEN the answer arrives hands back its own observable.
            return isObservable(answer) ? answer : of(answer)
        },
        assetMetadata$: args => {
            geeReads.push(args)
            return of({bandNames: [], properties: {}})
        }
    },
    recipe: {load$: id => throwError(() => new Error(`Unexpected recipe load: ${id}`))},
    tasks: {
        submit$: task => {
            submitted.push(task)
            return of(task)
        }
    }
}}))
// The key stands for the message, with any values it names appended, so a message that has to identify
// something is asserted on what it identifies rather than on which key it used.
vi.mock('~/translate', () => ({
    msg: (key, values) => [
        Array.isArray(key) ? key.join('.') : key,
        ...Object.values(values || {})
    ].join(' ')
}))
vi.mock('~/user', () => ({isGoogleAccount: () => true}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// The one destination widget that checks Earth Engine: it names the asset, picks a strategy and reports that
// its check has settled. Array bands can only go to Earth Engine, so a CCDC export needs it.
vi.mock('~/widget/assetDestination', () => ({
    AssetDestination: ({assetInput, strategyInput, onValidityCheckChange}) => {
        useEffect(() => {
            assetInput.set('users/x/segments')
            strategyInput.set('fail')
            onValidityCheckChange(false)
        }, [])
        return null
    }
}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// The registry as production wires Masking's own entry.
vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const {getAvailableBands} = await import('../../bands')
    const {getPreSetVisualizations} = await import('../../visualizations')
    return {
        getRecipeType: type => type === 'MASKING'
            ? {id: 'MASKING', getAvailableBands, getPreSetVisualizations}
            : {id: type, getDateRange: () => [], getPreSetVisualizations: () => []}
    }
})

const {ccdcMeasures, ccdcOutputBands} = await import('#sepal/recipe/type/ccdc')
const {SourceEvidenceSync} = await import('~/app/home/body/process/recipe/sourceEvidenceSync')
const {maskingObservation} = await import('../../maskingSourceEvidence')
const {Retrieve} = await import('./retrieve')
const {Retrieve: ClassificationRetrieve} = await import('../../../classification/panels/retrieve/retrieve')
const {Retrieve: CcdcRetrieve} = await import('../../../ccdc/panels/retrieve/retrieve')
const {Retrieve: PhenologyRetrieve} = await import('../../../phenology/panels/retrieve/retrieve')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The panel's own minimum, matched here rather than imported: a change to it must be a deliberate change to
// these expectations too.
const MINIMUM_LOADING_MS = 500
const PAST_MINIMUM_MS = MINIMUM_LOADING_MS + 50

describe('retrieving a generated index from Masking over an optical mosaic', () => {
    it('shows the index in the band control, and submits it once clicked and applied', async () => {
        await open()

        await click('nbr')
        await click('process.retrieve.form.destination.DRIVE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['nbr']})
        expect(geeReads).toEqual([])
    })
})

// The collection this Asset recipe filters is read as its first image, which holds red alone. What the recipe
// provides, and so what Retrieve offers, is what its own configured image holds.
describe('retrieving from Masking over an Asset recipe that filters its collection', () => {
    it('shows the band the filter leaves, and submits it once clicked and applied', async () => {
        observed.answer = ({asset}) => asset
            ? [{name: 'red', arrayDimensions: 0}]
            : [{name: 'red', arrayDimensions: 0}, {name: 'nir', arrayDimensions: 0}]

        await open({recipes: [MASKED_ASSET, ASSET_RECIPE], id: MASKED_ASSET.id})

        await click('nir')
        await click('process.retrieve.form.destination.DRIVE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['nir']})
    })
})

// CCDC fits only the measures it is asked for, so the image it builds unrequested holds the breakpoint
// measures alone. What Retrieve may offer is the catalogue CCDC declares.
describe('retrieving a CCDC measure it does not break on, through Masking', () => {
    it('shows it in the band control, and submits the physical bands in CCDC\'s order once clicked and applied', async () => {
        observed.answer = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})

        await click('red_coefs')
        await click('tStart')
        await click('process.retrieve.form.destination.GEE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', 'red_coefs']})
    })

    // Masking preserves what CCDC declares of its bands; its own fallback never reaches an array band.
    it('exports each under the policy CCDC declares', async () => {
        observed.answer = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})
        await click('red_coefs')
        await click('tStart')
        await click('process.retrieve.form.destination.GEE')
        await click('process.retrieve.apply')

        expect(submitted[0].params.image.pyramidingPolicy).toEqual({red_coefs: 'sample', tStart: 'sample'})
    })
})

// What Retrieve offers is what the resolution in flight eventually describes - never the band names copied
// into the model when the source was selected, which nothing has verified since.
describe('a saved band snapshot that disagrees with the catalogue', () => {
    const STALE = 'stale_coefs'

    const staleSnapshot = (bands = ['tStart', STALE]) => ({
        ...MASKED_CCDC,
        model: {...MASKED_CCDC.model, imageToMask: {...MASKED_CCDC.model.imageToMask, bands}}
    })

    const catalogue = () => ccdcOutputBands(ccdcMeasures({model: CCDC.model}))

    it('offers none of its names while the resolution is still in flight', async () => {
        const answer = answering()

        await open({recipes: [staleSnapshot(), CCDC], id: MASKED_CCDC.id})

        expect(offers(STALE)).toBe(false)
        expect(offers('tStart')).toBe(false)

        await answer.arrive(catalogue())

        expect(offers('tStart')).toBe(true)
        expect(offers(STALE)).toBe(false)
    })

    it('submits nothing while the resolution is still in flight', async () => {
        answering()

        await open({recipes: [staleSnapshot(), CCDC], id: MASKED_CCDC.id})
        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('keeps the saved selection through loading and submits exactly it once resolved', async () => {
        const answer = answering()
        const saved = {
            ...staleSnapshot(['tStart']),
            ui: {retrieve: {destination: 'GEE', bands: ['tStart', 'red_coefs']}}
        }

        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        await answer.arrive(catalogue())
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', 'red_coefs']})
    })

    it('drops a saved band the catalogue does not hold once it answers, and submits the rest', async () => {
        const answer = answering()
        const saved = {
            ...staleSnapshot(),
            ui: {retrieve: {destination: 'GEE', bands: ['tStart', STALE]}}
        }

        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        await answer.arrive(catalogue())

        expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')

        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart']})
    })

    // A failure shows nothing about which bands exist, so the next answer is what decides the selection.
    it('keeps the saved selection through a failed resolution', async () => {
        const failing = answering()
        const saved = {
            ...staleSnapshot(['tStart']),
            ui: {retrieve: {destination: 'GEE', bands: ['tStart', 'red_coefs']}}
        }

        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        await failing.fail()
        const answer = answering()
        await editRecipe(MASKED_CCDC.id, {model: {...saved.model, imageMask: {type: 'RECIPE_REF', id: CCDC.id, revised: true}}})
        await answer.arrive(catalogue())
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', 'red_coefs']})
    })

    it('offers nothing and explains itself when the resolution fails', async () => {
        const answer = answering()

        await open({recipes: [staleSnapshot(), CCDC], id: MASKED_CCDC.id})
        await answer.fail()

        expect(offers(STALE)).toBe(false)
        expect(offers('tStart')).toBe(false)
        expect(shown()).toContain('process.retrieve.error.imageOutput')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    // The user edits the recipe while an answer is outstanding. The replacement resolves from configuration
    // alone, and the answer to the question that was replaced can no longer describe anything.
    it('lets no superseded answer reach the replacement', async () => {
        const answer = answering()
        const masked = staleSnapshot()

        await open({recipes: [masked, CCDC, MOSAIC], id: masked.id})
        await editRecipe(masked.id, {
            model: {...masked.model, imageToMask: {type: 'RECIPE_REF', id: MOSAIC.id}}
        })
        await answer.arrive(catalogue())

        expect(offers('nbr')).toBe(true)
        expect(offers('red_coefs')).toBe(false)
        expect(offers(STALE)).toBe(false)
    })
})

// Once the catalogue has answered, a selected band it does not hold is no longer a choice, and goes from the
// selection. The bands still offered stay selected; nothing is chosen in its place.
describe('a selected band the catalogue does not hold', () => {
    const MISSING = 'red_coefs'

    const saved = bands => ({...MASKED_CCDC, ui: {retrieve: {destination: 'GEE', bands}}})

    const withoutRed = () => ccdcOutputBands(['ndvi'])
    const withRed = () => ccdcOutputBands(['ndvi', 'red'])

    const opened = async (bands = ['tStart', MISSING]) => {
        observed.answer = () => withoutRed()
        await open({recipes: [saved(bands), CCDC], id: MASKED_CCDC.id})
    }

    it('goes silently, and the bands still offered are submitted', async () => {
        await opened()

        expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')

        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart']})
    })

    it('stays gone when the catalogue holds it again', async () => {
        await opened()

        observed.answer = () => withRed()
        await editRecipe(MASKED_CCDC.id, {model: {...MASKED_CCDC.model, imageMask: {type: 'RECIPE_REF', id: CCDC.id, revised: true}}})
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart']})
    })

    // An empty selection is not "all bands": the user chooses again.
    it('leaves nothing selected when it was the only band, and blocks until one is chosen', async () => {
        await opened([MISSING])

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])

        await click('ndvi_coefs')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['ndvi_coefs']})
    })
})

describe('retrieving from a Classification whose classifier changes', () => {
    const saved = {
        ...CLASSIFICATION,
        ui: {retrieve: {destination: 'GEE', bands: ['class', 'regression']}}
    }

    const toSvm = () => editRecipe(CLASSIFICATION.id, {
        model: {...CLASSIFICATION.model, classifier: {type: 'SVM'}}
    })

    it('drops the regression SVM does not provide, keeping the class, which it submits', async () => {
        await open({recipes: [saved], id: CLASSIFICATION.id, Panel: ClassificationRetrieve})

        await toSvm()

        expect(offers('regression')).toBe(false)
        expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')

        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['class']})
        expect(submitted[0].params.image.pyramidingPolicy).toEqual({class: 'mode'})
    })
})

// A band Phenology never offers - one of the arrays it builds its metrics from - saved beside ones it does.
describe('retrieving from a Phenology with a saved band it does not offer', () => {
    it('drops that band and submits the rest', async () => {
        const saved = {...PHENOLOGY, ui: {retrieve: {destination: 'GEE', bands: ['segment_1', 'background']}}}

        await open({recipes: [saved], id: PHENOLOGY.id, Panel: PhenologyRetrieve})
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['background']})
        expect(geeReads).toEqual([])
    })
})

describe('retrieving CCDC measures', () => {
    const catalogue = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

    const retrieving = (measures, ccdc = CCDC) => ({...ccdc, ui: {retrieve: {destination: 'GEE', bands: measures}}})

    const onSentinel2 = ccdc => ({...ccdc, model: {...ccdc.model, sources: {...ccdc.model.sources, dataSets: {SENTINEL_2: ['SENTINEL_2']}}}})

    // Thermal is carried by Landsat and not by Sentinel-2.
    it('drops a saved measure the collection no longer carries, and submits the rest', async () => {
        observed.answer = catalogue
        const saved = onSentinel2(retrieving(['red', 'thermal']))

        await open({recipes: [saved], id: CCDC.id, Panel: CcdcRetrieve})
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual(['red'])
    })

    // A breakpoint band is the recipe's configuration, not a saved choice: nothing chosen can be dropped to fix it.
    it('still names a breakpoint band the collection no longer carries, and submits nothing', async () => {
        observed.answer = catalogue
        const breakingOnThermal = {...CCDC, model: {...CCDC.model, sources: {...CCDC.model.sources, breakpointBands: ['thermal']}}}
        const saved = onSentinel2(retrieving(['red'], breakingOnThermal))

        await open({recipes: [saved], id: CCDC.id, Panel: CcdcRetrieve})

        expect(shown()).toContain('process.retrieve.form.bands.unavailable thermal')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    // A MEDOID collection keeps each scene's acquisition dates; they are metadata, not measures to fit.
    describe('over a MEDOID collection', () => {
        const medoid = ccdc => ({...ccdc, model: {...ccdc.model, options: {...ccdc.model.options, compose: 'MEDOID'}}})

        it('offers its spectral measures, and none of the acquisition dates', async () => {
            observed.answer = catalogue

            await open({recipes: [medoid(CCDC)], id: CCDC.id, Panel: CcdcRetrieve})

            expect(offers('red')).toBe(true)
            expect(['unixTimeDays', 'dayOfYear', 'daysFromTarget'].filter(offers)).toEqual([])
        })

        it('drops a saved date measure, and submits the rest', async () => {
            observed.answer = catalogue
            const saved = medoid(retrieving(['red', 'unixTimeDays']))

            await open({recipes: [saved], id: CCDC.id, Panel: CcdcRetrieve})
            await click('process.retrieve.apply')

            expect(submitted).toHaveLength(1)
            expect(submitted[0].params.image.bands).toEqual(['red'])
        })

        it('still names a configured date breakpoint, and submits nothing', async () => {
            observed.answer = catalogue
            const breakingOnDates = {...CCDC, model: {...CCDC.model, sources: {...CCDC.model.sources, breakpointBands: ['unixTimeDays']}}}
            const saved = medoid(retrieving(['red'], breakingOnDates))

            await open({recipes: [saved], id: CCDC.id, Panel: CcdcRetrieve})

            expect(shown()).toContain('process.retrieve.form.bands.unavailable unixTimeDays')

            await click('process.retrieve.apply')

            expect(submitted).toEqual([])
        })
    })
})

describe('what makes the panel resolve again', () => {
    const catalogue = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

    const resolved = async () => {
        observed.answer = catalogue
        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})
        expect(offers('red_coefs')).toBe(true)
        return geeReads.length
    }

    it('keeps its choices, and asks nothing more, through panel state and a rename', async () => {
        const reads = await resolved()

        await editUi(MASKED_CCDC.id, {panelExpanded: true})
        await editRecipe(MASKED_CCDC.id, {title: 'Renamed'})

        expect(offers('red_coefs')).toBe(true)
        expect(shown()).not.toContain('process.retrieve.form.bands.loading')
        expect(geeReads).toHaveLength(reads)
    })

    it('withholds them the moment the model changes, blocks retrieval and asks again', async () => {
        const reads = await resolved()
        const answer = answering()

        await editRecipe(MASKED_CCDC.id, {
            model: {...MASKED_CCDC.model, imageMask: {type: 'RECIPE_REF', id: CCDC.id, revised: true}}
        })

        expect(offers('red_coefs')).toBe(false)
        expect(geeReads.length).toBeGreaterThan(reads)
        // An open panel stays open: only the choices are withheld, never the form behind the opening view.
        expect(shown()).toContain('process.retrieve.form.scale')
        expect(shown()).not.toContain('process.retrieve.form.bands.loading')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])

        await answer.arrive(ccdcOutputBands(ccdcMeasures({model: CCDC.model})))

        expect(offers('red_coefs')).toBe(true)
    })

    it('resolves afresh when the panel is opened again', async () => {
        const reads = await resolved()

        act(() => root.unmount())
        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})

        expect(geeReads.length).toBeGreaterThan(reads)
        expect(offers('red_coefs')).toBe(true)
    })
})

// The producer behind the mask can change while the masking recipe itself is untouched. What reaches the panel
// then is the evidence its lifecycle publishes about that source - which is where its validity comes from, not
// merely how it is presented.
describe('a change to the producer behind the mask', () => {
    const THERMAL = 'thermal_coefs'

    const catalogue = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

    // Thermal is carried by Landsat and not by Sentinel-2, so switching the producer's data sets is a band
    // the mask can no longer offer.
    const sourcedFrom = dataSets => ({
        model: {...CCDC.model, sources: {...CCDC.model.sources, dataSets}}
    })
    const SENTINEL_2 = sourcedFrom({SENTINEL_2: ['SENTINEL_2']})
    const LANDSAT_7 = sourcedFrom({LANDSAT: ['LANDSAT_7']})

    const openSelecting = async bands => {
        observed.answer = catalogue
        const saved = {...MASKED_CCDC, ui: {retrieve: {destination: 'GEE', bands}}}
        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        expect(offers(THERMAL)).toBe(true)
    }

    it('withdraws a band it no longer provides, dropping it from the selection and submitting the rest', async () => {
        await openSelecting(['tStart', THERMAL])

        await editRecipe(CCDC.id, SENTINEL_2)

        expect(offers(THERMAL)).toBe(false)

        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart']})
    })

    it('withholds its choices and blocks submission when the source cannot be read again', async () => {
        await openSelecting(['tStart'])

        observed.answer = null
        await editRecipe(CCDC.id, SENTINEL_2)

        expect(offers('tStart')).toBe(false)
        expect(shown()).toContain('process.retrieve.error.imageOutput')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('offers what the producer provides once it can be read again', async () => {
        await openSelecting(['tStart'])
        observed.answer = null
        await editRecipe(CCDC.id, SENTINEL_2)
        expect(shown()).toContain('process.retrieve.error.imageOutput')

        observed.answer = catalogue
        await editRecipe(CCDC.id, LANDSAT_7)

        expect(offers(THERMAL)).toBe(true)

        await click(THERMAL)
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', THERMAL]})
    })
})

// The panel opens on a loading view rather than on an empty form that fills in. It is held for a minimum so a
// near-instant answer cannot make it flicker past, and the minimum overlaps the read rather than following it.
describe('the view a panel opens with', () => {
    const LOADING = 'process.retrieve.form.bands.loading'
    const FORM = 'process.retrieve.form.scale'

    const mountMasked = () => mountPanel({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})

    it('holds the loading view for the minimum, then reveals the whole form', async () => {
        observed.answer = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))
        await mountMasked()

        expect(shown()).toContain(LOADING)
        expect(shown()).not.toContain(FORM)

        await advanceBy(MINIMUM_LOADING_MS - 50)

        expect(shown()).toContain(LOADING)

        await advanceBy(50)

        expect(shown()).not.toContain(LOADING)
        expect(shown()).toContain(FORM)
        expect(offers('red_coefs')).toBe(true)
    })

    it('waits for a read outstanding past the minimum, and blocks retrieval meanwhile', async () => {
        const answer = answering()
        await mountMasked()

        await advanceBy(PAST_MINIMUM_MS)

        expect(shown()).toContain(LOADING)
        expect(shown()).not.toContain(FORM)

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])

        await answer.arrive(ccdcOutputBands(ccdcMeasures({model: CCDC.model})))

        expect(shown()).toContain(FORM)
        expect(offers('tStart')).toBe(true)
    })

    it('shows a failure without waiting for the minimum', async () => {
        const answer = answering()
        await mountMasked()

        await answer.fail()

        expect(shown()).toContain('process.retrieve.error.imageOutput')
        expect(shown()).toContain(FORM)
        expect(shown()).not.toContain(LOADING)
    })
})

// Masking preserves a declared source's description, and with it each band's declared policy.
describe.each([
    ['a regression', () => REGRESSION, 'regression', 'mean'],
    ['an unsupervised classification', () => CLUSTERS, 'class', 'mode'],
    ['an index change', () => INDEX_CHANGE, 'change', 'mode'],
    ['a class change', () => CLASS_CHANGE, 'confidence', 'mean'],
    ['a classification', () => CLASSIFICATION, 'class', 'mode'],
    ['a classification', () => CLASSIFICATION, 'probability_2', 'mean'],
    ['a remapping', () => REMAPPING, 'class', 'mode'],
    ['a phenology', () => PHENOLOGY, 'slope_1', 'mean'],
    ['a PyEO alerts recipe', () => PYEO_ALERTS, 'total_changes', 'sample'],
    ['a LandTrendr', () => LANDTRENDR, 'yod', 'sample'],
    ['a LandTrendr', () => LANDTRENDR, 'dur', 'sample'],
    ['a LandTrendr', () => LANDTRENDR, 'mag', 'mean'],
    ['a BAYTS alerts recipe', () => BAYTS_ALERTS, 'flag', 'sample'],
    ['a BAYTS alerts recipe', () => BAYTS_ALERTS, 'change_probability', 'sample'],
    ['a Change Alerts recipe', () => CHANGE_ALERTS, 'confidence', 'sample'],
    ['a Change Alerts recipe', () => CHANGE_ALERTS, 'detection_count', 'sample']
])('retrieving from Masking over %s', (_source, source, band, policy) => {
    it(`exports its ${band} band to Earth Engine under ${policy}, reading nothing`, async () => {
        const masked = maskingOver(source())

        await open({recipes: [masked, source()], id: masked.id})
        await click(band)
        await click('process.retrieve.form.destination.GEE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: [band]})
        expect(submitted[0].params.image.pyramidingPolicy).toEqual({[band]: policy})
        expect(geeReads).toEqual([])
    })
})

describe('retrieving from Masking over a Change Alerts recipe', () => {
    it('exports to Drive with no pyramiding policy, reading nothing', async () => {
        const masked = maskingOver(CHANGE_ALERTS)

        await open({recipes: [masked, CHANGE_ALERTS], id: masked.id})
        await click('confirmation_date')
        await click('process.retrieve.form.destination.DRIVE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['confirmation_date']})
        expect(submitted[0].params.image).not.toHaveProperty('pyramidingPolicy')
        expect(geeReads).toEqual([])
    })
})

// A source that declares no output is described by what the evidence lifecycle observed of it. Masking has no policy
// of its own, so its fallback reaches only the bands that evidence currently vouches for as scalar.
describe('retrieving from Masking over a recipe that declares no output', () => {
    it('offers what its source was observed to hold, and exports a scalar band under the fallback', async () => {
        observed.answer = () => [{name: 'class', arrayDimensions: 0}, {name: 'probability', arrayDimensions: 1}]

        await open({recipes: [MASKED_BAND_MATH, BAND_MATH], id: MASKED_BAND_MATH.id})
        await click('class')
        await click('process.retrieve.form.destination.GEE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['class']})
        expect(submitted[0].params.image.pyramidingPolicy).toEqual({class: 'mean'})
    })

    it('exports no band observed as an array, for which it has no policy', async () => {
        observed.answer = () => [{name: 'class', arrayDimensions: 0}, {name: 'probability', arrayDimensions: 1}]

        await open({recipes: [MASKED_BAND_MATH, BAND_MATH], id: MASKED_BAND_MATH.id})
        await click('probability')
        await click('process.retrieve.form.destination.GEE')
        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('offers nothing until its source has been observed', async () => {
        answering()

        await open({recipes: [MASKED_BAND_MATH, BAND_MATH], id: MASKED_BAND_MATH.id})

        expect(offers('class')).toBe(false)
    })
})

// Evidence is about the source as it was read. Once the lifecycle reads the source again - it changed, or the
// credentials it was read under were replaced - what it published before no longer describes the current source, and
// pairing it with the session as it now stands must not authorize an export.
describe('evidence observed of a source before it changed', () => {
    const SCALAR = [{name: 'class', arrayDimensions: 0}]
    const savedDrive = {...MASKED_BAND_MATH, ui: {retrieve: {destination: 'DRIVE', bands: ['class']}}}

    const openObserved = async () => {
        observed.answer = () => SCALAR
        await open({recipes: [savedDrive, BAND_MATH], id: savedDrive.id})
        expect(offers('class')).toBe(true)
    }

    it.each([
        ['its source is edited, keeping its id', () => editRecipe(BAND_MATH.id, {
            model: {...BAND_MATH.model, outputBands: {outputImages: []}}
        })],
        ['the credentials it was read under are replaced', () => replaceCredentials()]
    ])('authorizes nothing once %s, until the source is observed again', async (_case, change) => {
        await openObserved()
        const answer = answering()

        await change()
        await click('process.retrieve.apply')

        expect(submitted).toEqual([])

        await answer.arrive(SCALAR)
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
    })

    // A click can land after the session changed and before the lifecycle has rendered that change, so whether the
    // evidence is still current is decided when Apply is clicked, not when the lifecycle next reacts.
    it.each([
        ['its source is edited, keeping its id', () => editAction(BAND_MATH.id, {
            model: {...BAND_MATH.model, outputBands: {outputImages: []}}
        })],
        ['the credentials it was read under are replaced', () => credentialsAction()]
    ])('authorizes nothing when applied as %s, before the lifecycle has reacted', async (_case, change) => {
        await openObserved()
        answering()
        const apply = buttons().find(button => button.textContent === 'process.retrieve.apply')

        await act(async () => {
            store.dispatch(change())
            apply.click()
        })

        expect(submitted).toEqual([])
    })

    it('exports nothing the source has since become that its policy cannot cover', async () => {
        await openObserved()
        const answer = answering()

        await editRecipe(BAND_MATH.id, {model: {...BAND_MATH.model, outputBands: {outputImages: []}}})
        await answer.arrive([{name: 'class', arrayDimensions: 1}])
        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })
})

const CCDC = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2000-01-01', endDate: '2020-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
    }
}

const MASKED_CCDC = {
    id: 'masked-ccdc-1',
    type: 'MASKING',
    title: 'Masked segments',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: CCDC.id},
        imageMask: {type: 'RECIPE_REF', id: CCDC.id}
    },
    ui: {}
}

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
}

const MASKING = {
    id: 'masked-1',
    type: 'MASKING',
    title: 'Masked mosaic',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: MOSAIC.id},
        imageMask: {type: 'RECIPE_REF', id: MOSAIC.id}
    },
    ui: {}
}

const ASSET_RECIPE = {
    id: 'asset-1',
    type: 'ASSET_MOSAIC',
    model: {
        assetDetails: {assetId: 'users/x/collection', type: 'ImageCollection'},
        dates: {type: 'DATE_RANGE', fromDate: '2021-01-01', toDate: '2022-01-01'},
        composite: {type: 'MOSAIC'}
    }
}

const MASKED_ASSET = {
    id: 'masked-asset-1',
    type: 'MASKING',
    title: 'Masked asset',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: ASSET_RECIPE.id},
        imageMask: {type: 'RECIPE_REF', id: ASSET_RECIPE.id}
    },
    ui: {}
}

// A recipe type that declares no output, over nothing, and a Masking over it.
const BAND_MATH = {
    id: 'band-math-1',
    type: 'BAND_MATH',
    model: {inputImagery: {images: []}}
}

const MASKED_BAND_MATH = {
    id: 'masked-remapping-1',
    type: 'MASKING',
    title: 'Masked band math',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: BAND_MATH.id},
        imageMask: {type: 'RECIPE_REF', id: BAND_MATH.id}
    },
    ui: {}
}

const COVARIATES = {imageId: 'image-1', type: 'ASSET', id: 'users/x/covariates'}

const REGRESSION = {
    id: 'regression-1',
    type: 'REGRESSION',
    model: {
        inputImagery: {images: [COVARIATES]},
        trainingData: {dataSets: [{type: 'EE_TABLE', referenceData: []}]}
    }
}

const CLUSTERS = {
    id: 'clusters-1',
    type: 'UNSUPERVISED_CLASSIFICATION',
    model: {
        inputImagery: {images: [COVARIATES]},
        clusterer: {type: 'KMEANS', numberOfClusters: 5}
    }
}

const INDEX_CHANGE = {
    id: 'index-change-1',
    type: 'INDEX_CHANGE',
    model: {
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        fromImage: {type: 'ASSET', id: 'users/x/before', band: 'ndvi'},
        toImage: {type: 'ASSET', id: 'users/x/after', band: 'ndvi'},
        legend: {entries: [{value: 1, booleanOperator: 'and', constraints: [{image: 'this-recipe', band: 'difference', operator: '>', value: 0}]}]},
        options: {minConfidence: 2.5}
    }
}

const CLASSES = [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]

const CLASS_CHANGE = {
    id: 'class-change-1',
    type: 'CLASS_CHANGE',
    model: {
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        fromImage: {type: 'ASSET', id: 'users/x/before', band: 'class', bands: {class: {values: [1, 2]}}, legendEntries: CLASSES},
        toImage: {type: 'ASSET', id: 'users/x/after', band: 'class', bands: {class: {values: [1, 2]}}, legendEntries: CLASSES},
        options: {minConfidence: 0}
    }
}

const CLASSIFICATION = {
    id: 'classification-1',
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [COVARIATES]},
        legend: {entries: CLASSES},
        trainingData: {dataSets: [{type: 'SAMPLE_CLASSIFICATION', referenceData: []}]},
        classifier: {type: 'RANDOM_FOREST'}
    }
}

const REMAPPING = {
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [COVARIATES]},
        legend: {entries: [{value: 1, booleanOperator: 'and', constraints: []}]}
    }
}

const AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [1, 0]]}

const PHENOLOGY = {
    id: 'phenology-1',
    type: 'PHENOLOGY',
    model: {
        aoi: AOI,
        dates: {fromYear: 2022, toYear: 2022},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'evi'},
        options: {corrections: ['SR']}
    }
}

const PYEO_ALERTS = {
    id: 'pyeo-alerts-1',
    type: 'PYEO_ALERTS',
    model: {
        aoi: AOI,
        dates: {monitoringStart: '2023-01-01', monitoringEnd: '2024-01-01'},
        sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, changeFromClasses: [1], changeToClasses: [2]}
    }
}

const LANDTRENDR = {
    id: 'landtrendr-1',
    type: 'LANDTRENDR',
    model: {
        aoi: AOI,
        dates: {startYear: 2000, endYear: 2024},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'},
        options: {corrections: ['SR']},
        landTrendrOptions: {changeDirection: 'LOSS'}
    }
}

// Monitoring and continuing from assets, so that nothing it reads has to be loaded or observed.
const BAYTS_ALERTS = {
    id: 'bayts-alerts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference: {type: 'ASSET', id: 'users/x/bayts-historical'},
        date: {monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
        options: {orbits: ['ASCENDING', 'DESCENDING']},
        baytsAlertsOptions: {previousAlertsAsset: {type: 'ASSET', id: 'users/x/previous-alerts'}}
    }
}

// Monitoring a segments asset, so that nothing it reads has to be loaded or observed.
const CHANGE_ALERTS = {
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'ASSET', id: 'users/x/segments'},
        date: {
            monitoringEnd: '2024-01-01',
            monitoringDuration: 2,
            monitoringDurationUnit: 'months',
            calibrationDuration: 3,
            calibrationDurationUnit: 'months'
        },
        sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']},
        changeAlertsOptions: {}
    }
}

const maskingOver = source => ({
    id: `masked-${source.id}`,
    type: 'MASKING',
    title: 'Masked',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: source.id},
        imageMask: {type: 'RECIPE_REF', id: source.id}
    },
    ui: {}
})

let root
let store

// The panel opens on a loading view held for a minimum, so a scenario about anything else waits that out
// before looking. A scenario about the view itself mounts and advances the clock itself.
const open = async (args = {}) => {
    await mountPanel(args)
    await advanceBy(PAST_MINIMUM_MS)
}

const mountPanel = ({recipes = [MASKING, MOSAIC], id = MASKING.id, Panel = Retrieve} = {}) => {
    const [, ...sources] = recipes
    store = createStore(
        (state = {
            dimensions: {width: 1024, height: 768},
            user: {currentUser: {googleTokens: {}}},
            process: {
                loadedRecipes: Object.fromEntries(recipes.map(recipe => [recipe.id, recipe])),
                recipes: sources.map(({id, type}) => ({id, name: id, type})),
                projects: [],
                tabs: []
            }
        }, action) => action.reduce ? action.reduce(state) : state
    )
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <SourceRuntimeProvider>
                        <Recipe id={id}>
                            <SourceEvidenceSync observation={maskingObservation}/>
                            <Panel/>
                        </Recipe>
                    </SourceRuntimeProvider>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
}

const buttons = () => [...document.querySelectorAll('button')]

const click = label => act(async () => {
    const button = buttons().find(button => button.textContent === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    button.click()
})

const offers = label => buttons().some(button => button.textContent === label)

const shown = () => document.body.textContent

// The panel reads the recipe out of the store, so replacing the record is what a user editing the recipe
// does - and what changes the basis the panel resolves.
const editRecipe = (id, update) => act(async () => store.dispatch(editAction(id, update)))

const editAction = (id, update) => ({
    type: 'EDIT_RECIPE',
    reduce: state => ({
        ...state,
        process: {
            ...state.process,
            loadedRecipes: {
                ...state.process.loadedRecipes,
                [id]: {...state.process.loadedRecipes[id], ...update}
            }
        }
    })
})

// The Earth Engine credentials replaced, as signing in again replaces them.
const replaceCredentials = () => act(async () => store.dispatch(credentialsAction()))

const credentialsAction = () => ({
    type: 'REPLACE_CREDENTIALS',
    reduce: state => ({
        ...state,
        user: {...state.user, currentUser: {...state.user.currentUser, googleTokens: {accessTokenExpiryDate: Date.now()}}}
    })
})

// A transient view change, leaving everything the panel resolves - and the evidence the sync component holds -
// exactly as it was.
const editUi = (id, update) => editRecipe(id, {
    ui: {...store.getState().process.loadedRecipes[id].ui, ...update}
})

const advanceBy = ms => act(async () => vi.advanceTimersByTime(ms))

// One outstanding answer, replayed: every request for it waits, and the panel restarting its resolution -
// which the evidence lifecycle causes by publishing what it observed - asks the same question again.
const answering = () => {
    const pending = new ReplaySubject(1)
    observed.answer = () => pending
    return {
        arrive: bandNames => act(async () => {
            pending.next(bandNames)
            pending.complete()
        }),
        fail: () => act(async () => pending.error(new Error('Earth Engine is unreachable')))
    }
}

// Only the panel's own minimum-duration timer is suspended; faking more than the two calls it makes would put
// React's scheduling under test control too.
beforeEach(() => vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']}))

afterEach(() => {
    act(() => root?.unmount())
    vi.useRealTimers()
    document.body.innerHTML = ''
    submitted.length = 0
    geeReads.length = 0
    observed.answer = null
    store = null
})
