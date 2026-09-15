import {of, Subject, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// CCDC Slice observing the segments it slices, through the shared evidence lifecycle. The lifecycle's own
// rules - basis, supersession, reload of a stale record - are proven in sourceEvidenceSync.test.js with
// Masking; what is proven here is that Slice's observation drives them the same way: which provider answers
// for each kind of source, and what makes it read again.
//
// The providers are the real ones, reached through the registry the way production reaches them. Only the
// band vocabulary and Earth Engine are stood in for.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

const assetMetadata$ = vi.fn()
vi.mock('~/apiRegistry', () => ({
    default: {gee: {assetMetadata$: (...args) => assetMetadata$(...args)}}
}))

vi.mock('~/sources', () => ({
    getAvailableBands: ({dataSets, classification}) => [
        ...dataSets.map(dataSet => dataSet.toLowerCase()),
        ...(classification?.classifierType ? ['regression'] : [])
    ]
}))

vi.mock('../ccdc/ccdcRecipe', () => ({
    getAllVisualizations: recipe => recipe.model.templates || []
}))

// The registry as production wires it: each producer type answers with the provider it registers.
vi.mock('../../recipeTypeRegistry', async () => {
    const {describeSegments$} = await import('../ccdc/segmentDescription')
    const {describeSegmentsAsset$} = await import('../ccdc/segmentsAsset')
    return {
        getRecipeType: type => ({
            CCDC: {describeSegments$},
            ASSET_MOSAIC: {describeSegments$: ({recipe}) => describeSegmentsAsset$(recipe.model.assetDetails.assetId)}
        })[type]
    }
})

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {sliceObservation} = await import('./sliceObservation')

const recipeSelection = id => ({type: 'RECIPE_REF', id})

const sliceOver = (source, {date = {date: '2020-06-01'}, options = {harmonics: 3}} = {}) => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    model: {source, date, options}
})

const ccdc = ({id = 'ccdc-1', fitted = ['NDVI'], dateFormat = 1, classification, templates} = {}) => ({
    id,
    type: 'CCDC',
    model: {
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: fitted}, ...(classification ? {classification} : {})},
        options: {corrections: []},
        ccdcOptions: {dateFormat},
        templates
    }
})

const classification = (legend = {entries: []}) => ({
    id: 'classification-1',
    type: 'CLASSIFICATION',
    model: {classifier: {type: 'RANDOM_FOREST'}, legend}
})

const assetMosaic = () => ({
    id: 'asset-mosaic-1',
    type: 'ASSET_MOSAIC',
    model: {
        aoi: {type: 'ASSET_BOUNDS'},
        assetDetails: {
            assetId: 'users/x/segments',
            // The copy taken when the asset was selected. Fresh metadata is what must be published.
            metadata: {bandNames: ['stale_coefs'], properties: {dateFormat: 9}}
        }
    }
})

const sync = ({
    recipe,
    loadedRecipes = {},
    catalogue = [],
    assetVersions = [],
    earthEngineGeneration = {},
    loadRecipe$ = id => of(loadedRecipes[id])
}) => {
    const dispatched = []
    const recipeActionBuilder = () => ({
        set(path, value) {
            this.written = {path, value}
            return this
        },
        dispatch() {
            dispatched.push(this.written)
        }
    })
    const component = new SourceEvidenceSync({
        observation: sliceObservation,
        recipe,
        loadedRecipes,
        catalogue,
        openRecipeIds: [],
        assetVersions,
        earthEngineGeneration,
        recipeActionBuilder,
        loadRecipe$,
        reloadRecipe$: loadRecipe$,
        stream: (_name, stream$, onNext, onError) => stream$.subscribe({next: onNext, error: onError})
    })
    const rerender = props => {
        component.props = {...component.props, ...props}
        component.componentDidUpdate()
    }
    return {component, rerender, evidence: () => dispatched.map(({value}) => value)}
}

beforeEach(() => assetMetadata$.mockReset())

describe('slicing a CCDC recipe', () => {
    it('publishes the description CCDC gives of its own segments', () => {
        const {component, evidence} = sync({
            recipe: sliceOver(recipeSelection('ccdc-1')),
            loadedRecipes: {'ccdc-1': ccdc()}
        })

        component.componentDidMount()

        expect(evidence()).toEqual([expect.objectContaining({
            sourceKey: 'RECIPE_REF:ccdc-1',
            status: 'OBSERVED',
            segments: expect.objectContaining({
                bands: ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude', 'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'],
                dateFormat: 1
            })
        })])
        expect(assetMetadata$).not.toHaveBeenCalled()
    })

    // CCDC declares the Classification it fits, so the closure brings it in and CCDC's own provider finds
    // it. Slice never locates it.
    it('includes the bands of the Classification CCDC declares', () => {
        const {component, evidence} = sync({
            recipe: sliceOver(recipeSelection('ccdc-1')),
            loadedRecipes: {'ccdc-1': ccdc({classification: 'classification-1'}), 'classification-1': classification()}
        })

        component.componentDidMount()

        expect(evidence()[0].segments.baseBands.map(({name}) => name)).toEqual(['ndvi', 'regression'])
    })
})

// The saved metadata is a copy taken when the asset was selected; an asset update leaves it behind.
describe('slicing an asset mosaic recipe', () => {
    it('reads the asset now rather than answering from the copy the recipe holds', () => {
        assetMetadata$.mockReturnValue(of({bandNames: ['nbr_coefs', 'tStart'], properties: {dateFormat: 2}}))
        const {component, evidence} = sync({
            recipe: sliceOver(recipeSelection('asset-mosaic-1')),
            loadedRecipes: {'asset-mosaic-1': assetMosaic()}
        })

        component.componentDidMount()

        expect(assetMetadata$).toHaveBeenCalledWith({asset: 'users/x/segments'})
        expect(evidence()[0].segments).toEqual(expect.objectContaining({
            bands: ['nbr_coefs', 'tStart'],
            dateFormat: 2
        }))
    })
})

describe('slicing a segments asset', () => {
    it('describes the segments from its metadata', () => {
        assetMetadata$.mockReturnValue(of({
            bandNames: ['nbr_coefs', 'nbr_rmse', 'nbr_magnitude', 'tStart'],
            properties: {dateFormat: 2}
        }))
        const {component, evidence} = sync({recipe: sliceOver({type: 'ASSET', id: 'users/x/segments'})})

        component.componentDidMount()

        expect(assetMetadata$).toHaveBeenCalledWith({asset: 'users/x/segments'})
        expect(evidence()[0].segments).toEqual(expect.objectContaining({
            baseBands: [{name: 'nbr', measures: expect.arrayContaining(['value', 'rmse', 'magnitude'])}],
            dateFormat: 2
        }))
    })
})

// Two styles over one band must stay two choices, and a refresh must not rename them - a selection names one
// of them in particular.
describe('the templates an asset carries', () => {
    const twoOverOneBand = {
        bandNames: ['ndvi_coefs'],
        properties: {
            visualization_0_bands: 'ndvi', visualization_0_type: 'continuous',
            visualization_0_min: '0', visualization_0_max: '1',
            visualization_1_bands: 'ndvi', visualization_1_type: 'continuous',
            visualization_1_min: '0', visualization_1_max: '2'
        }
    }

    it('are given distinct identities', () => {
        assetMetadata$.mockReturnValue(of(twoOverOneBand))
        const {component, evidence} = sync({recipe: sliceOver({type: 'ASSET', id: 'users/x/segments'})})

        component.componentDidMount()

        const [first, second] = evidence()[0].segments.visualizations
        expect(first.id).toBeDefined()
        expect(second.id).toBeDefined()
        expect(first.id).not.toBe(second.id)
    })

    it('keep the identities a previous read gave them', () => {
        assetMetadata$.mockReturnValue(of(twoOverOneBand))
        const {component, rerender, evidence} = sync({
            recipe: sliceOver({type: 'ASSET', id: 'users/x/segments'}),
            assetVersions: [{id: 'users/x/segments', updateTime: '1'}]
        })
        component.componentDidMount()
        const published = evidence()[0]

        rerender({
            recipe: {...sliceOver({type: 'ASSET', id: 'users/x/segments'}), ui: {sourceEvidence: published}},
            assetVersions: [{id: 'users/x/segments', updateTime: '2'}]
        })

        expect(evidence().at(-1).segments.visualizations.map(({id}) => id))
            .toEqual(published.segments.visualizations.map(({id}) => id))
    })
})

// A reopened recipe can still identify its saved preset before any observation has succeeded.
describe('a slice over an asset with nothing observed', () => {
    const ASSET = {type: 'ASSET', id: 'users/x/segments'}
    const twoOverOneBand = {
        bandNames: ['ndvi_coefs'],
        properties: {
            visualization_0_bands: 'ndvi', visualization_0_type: 'continuous',
            visualization_0_min: '0', visualization_0_max: '1',
            visualization_1_bands: 'ndvi', visualization_1_type: 'continuous',
            visualization_1_min: '0', visualization_1_max: '2'
        }
    }
    const showing = visParams => ({
        areas: {center: {imageLayer: {sourceId: 'this-recipe', layerConfig: {visParams}}}}
    })

    const savedStyle = () => {
        assetMetadata$.mockReturnValue(of(twoOverOneBand))
        const before = sync({recipe: sliceOver(ASSET)})
        before.component.componentDidMount()
        const [, second] = before.evidence()[0].segments.visualizations
        return {...second, id: 'saved-style'}
    }

    const identitiesFrom = recipe => {
        const {component, evidence} = sync({recipe})
        component.componentDidMount()
        return evidence()[0].segments.visualizations.map(({id}) => id)
    }

    it('keeps the identity the saved layer names when reopened', () => {
        const identities = identitiesFrom({...sliceOver(ASSET), layers: showing(savedStyle())})

        expect(identities[1]).toBe('saved-style')
        expect(identities[0]).not.toBe('saved-style')
    })

    it('keeps it when the initial read after reopening failed', () => {
        const identities = identitiesFrom({
            ...sliceOver(ASSET),
            layers: showing(savedStyle()),
            ui: {sourceEvidence: {sourceKey: 'ASSET:users/x/segments', status: 'UNAVAILABLE'}}
        })

        expect(identities[1]).toBe('saved-style')
    })
})

// Which template a saved selection means is the last successful read's business, and a failure in between
// does not change whose templates those were. The styles the layers were saved with stand in only while
// nothing has been read at all: after a source switch they describe the source before it.
describe('identifying an asset\'s templates across a failed read', () => {
    const A = {type: 'ASSET', id: 'users/x/a'}
    const B = {type: 'ASSET', id: 'users/x/b'}
    const twoOverOneBand = max => ({
        bandNames: ['ndvi_coefs'],
        properties: {
            visualization_0_bands: 'ndvi', visualization_0_type: 'continuous',
            visualization_0_min: '0', visualization_0_max: '1',
            visualization_1_bands: 'ndvi', visualization_1_type: 'continuous',
            visualization_1_min: '0', visualization_1_max: max
        }
    })

    // The session as the recipe sees it: the evidence published last, and the style the layer was left
    // showing, are what the next render is given.
    const session = source => {
        const {component, rerender, evidence} = sync({
            recipe: sliceOver(source),
            assetVersions: [{id: source.id, updateTime: '1'}]
        })
        let version = 1
        const published = () => evidence().at(-1)
        component.componentDidMount()
        const selected = published().segments.visualizations[1]
        return {
            published,
            selected,
            read: (nextSource = source) => {
                rerender({
                    recipe: {
                        ...sliceOver(nextSource),
                        layers: {areas: {center: {imageLayer: {sourceId: 'this-recipe', layerConfig: {visParams: selected}}}}},
                        ui: {sourceEvidence: published()}
                    },
                    assetVersions: [{id: nextSource.id, updateTime: `${++version}`}]
                })
            }
        }
    }

    it('keeps the identity the same source gave the selection before the failure', () => {
        assetMetadata$.mockReturnValue(of(twoOverOneBand('2')))
        const slice = session(A)

        assetMetadata$.mockReturnValue(throwError(() => new Error('forbidden')))
        slice.read()
        assetMetadata$.mockReturnValue(of(twoOverOneBand('2')))
        slice.read()

        expect(slice.published().segments.visualizations[1].id).toBe(slice.selected.id)
    })

    // The failure is about the new source, but what the layer still names is a style of the old one.
    it('gives none of the replacement\'s templates an identity from the source it replaced', () => {
        assetMetadata$.mockReturnValue(of(twoOverOneBand('2')))
        const slice = session(A)

        assetMetadata$.mockReturnValue(throwError(() => new Error('forbidden')))
        slice.read(B)
        assetMetadata$.mockReturnValue(of(twoOverOneBand('3')))
        slice.read(B)

        expect(slice.published().sourceKey).toBe('ASSET:users/x/b')
        slice.published().segments.visualizations.forEach(({id}) =>
            expect(id).not.toBe(slice.selected.id))
    })
})

describe('a source that does not produce segments', () => {
    it('is recorded as unavailable', () => {
        const {component, evidence} = sync({
            recipe: sliceOver(recipeSelection('mosaic-1')),
            loadedRecipes: {'mosaic-1': {id: 'mosaic-1', type: 'MOSAIC', model: {}}}
        })

        component.componentDidMount()

        expect(evidence()).toEqual([expect.objectContaining({
            sourceKey: 'RECIPE_REF:mosaic-1',
            status: 'UNAVAILABLE'
        })])
    })

    it('is recorded as unavailable when its metadata cannot be read', () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('forbidden')))
        const {component, evidence} = sync({recipe: sliceOver({type: 'ASSET', id: 'users/x/segments'})})

        component.componentDidMount()

        expect(evidence()[0].status).toBe('UNAVAILABLE')
    })
})

describe('looking again', () => {
    const open = extra => {
        const source = ccdc()
        return sync({
            recipe: sliceOver(recipeSelection('ccdc-1')),
            loadedRecipes: {'ccdc-1': source},
            catalogue: [{id: 'ccdc-1', revision: 3}],
            ...extra
        })
    }

    it('does not happen for a change to the slice\'s own date or options', () => {
        const selection = recipeSelection('ccdc-1')
        const {component, rerender, evidence} = sync({
            recipe: sliceOver(selection),
            loadedRecipes: {'ccdc-1': ccdc()},
            catalogue: [{id: 'ccdc-1', revision: 3}]
        })
        component.componentDidMount()

        rerender({recipe: sliceOver(selection, {date: {date: '2021-01-01'}, options: {harmonics: 1}})})
        rerender({})

        expect(evidence()).toHaveLength(1)
    })

    it('does not happen while nothing about the source has changed', () => {
        const {component, rerender, evidence} = open()
        component.componentDidMount()

        rerender({})
        rerender({})

        expect(evidence()).toHaveLength(1)
    })

    it('happens when the CCDC recipe is edited in the session, and reports the new fit', () => {
        const {component, rerender, evidence} = open()
        component.componentDidMount()

        rerender({loadedRecipes: {'ccdc-1': ccdc({fitted: ['NDVI', 'NBR']})}})

        expect(evidence().at(-1).segments.baseBands.map(({name}) => name)).toEqual(['ndvi', 'nbr'])
    })

    it('happens when the Classification the CCDC recipe declares is edited', () => {
        const source = ccdc({classification: 'classification-1'})
        const {component, rerender, evidence} = sync({
            recipe: sliceOver(recipeSelection('ccdc-1')),
            loadedRecipes: {'ccdc-1': source, 'classification-1': classification()}
        })
        component.componentDidMount()

        rerender({loadedRecipes: {'ccdc-1': source, 'classification-1': classification({entries: [{value: 9}]})}})

        expect(evidence()).toHaveLength(2)
    })

    it('happens when the source is replaced, and describes the replacement', () => {
        const {component, rerender, evidence} = open()
        component.componentDidMount()

        rerender({
            recipe: sliceOver(recipeSelection('ccdc-2')),
            loadedRecipes: {'ccdc-2': ccdc({id: 'ccdc-2', fitted: ['NBR'], dateFormat: 0})}
        })

        expect(evidence().at(-1)).toEqual(expect.objectContaining({
            sourceKey: 'RECIPE_REF:ccdc-2',
            segments: expect.objectContaining({dateFormat: 0})
        }))
    })

    it('happens when the catalogue revision of the CCDC recipe advances', () => {
        const {component, rerender, evidence} = open()
        component.componentDidMount()

        rerender({catalogue: [{id: 'ccdc-1', revision: 4}]})

        expect(evidence()).toHaveLength(2)
    })

    it('happens when a segments asset is updated, and reports what it now carries', () => {
        assetMetadata$
            .mockReturnValueOnce(of({bandNames: ['ndvi_coefs'], properties: {dateFormat: 0}}))
            .mockReturnValue(of({bandNames: ['nbr_coefs'], properties: {dateFormat: 1}}))
        const {component, rerender, evidence} = sync({
            recipe: sliceOver({type: 'ASSET', id: 'users/x/segments'}),
            assetVersions: [{id: 'users/x/segments', updateTime: '1'}]
        })
        component.componentDidMount()

        rerender({assetVersions: [{id: 'users/x/segments', updateTime: '2'}]})

        expect(evidence().at(-1).segments).toEqual(expect.objectContaining({
            bands: ['nbr_coefs'],
            dateFormat: 1
        }))
    })
})

// The answer arrives after the source it describes has been replaced. It is dropped, and what is published
// is about the replacement.
describe('an answer for a source no longer selected', () => {
    it('is not published', () => {
        const held = new Subject()
        assetMetadata$.mockReturnValueOnce(held).mockReturnValue(of({bandNames: ['nbr_coefs'], properties: {}}))
        const {component, rerender, evidence} = sync({recipe: sliceOver({type: 'ASSET', id: 'users/x/first'})})
        component.componentDidMount()

        rerender({recipe: sliceOver({type: 'ASSET', id: 'users/x/second'})})
        held.next({bandNames: ['ndvi_coefs'], properties: {}})
        held.complete()

        expect(evidence().map(({sourceKey}) => sourceKey)).toEqual(['ASSET:users/x/second'])
    })
})
