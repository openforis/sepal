import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Observable, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const capture = vi.hoisted(() => ({
    destinationButtons: null,
    googleAccount: true,
    onApply: null,
    panelButtons: null
}))

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children, onApply}) => {
        capture.onApply = onApply
        return children
    },
    recipeFormPanel: () => Component => Component
}))

vi.mock('~/app/home/body/process/recipeList/projectActions', () => ({updateProject: vi.fn()}))
vi.mock('~/classComponent', () => ({asFunctionalComponent: () => Component => Component}))
vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => Array.isArray(key) ? key.join('.') : key}))
vi.mock('~/user', () => ({isGoogleAccount: () => capture.googleAccount}))
vi.mock('~/widget/assetDestination', () => ({AssetDestination: () => null}))
vi.mock('~/widget/button', () => ({Button: () => null}))
vi.mock('~/widget/layout', () => ({Layout: ({children}) => children}))
vi.mock('~/widget/numberButtons', () => ({NumberButtons: () => null}))
vi.mock('~/widget/panel/panel', () => ({Panel: {Header: () => null, Content: ({children}) => children}}))
vi.mock('~/widget/workspaceDestination', () => ({WorkspaceDestination: () => null}))
vi.mock('~/widget/form', async importOriginal => {
    const {Form} = await importOriginal()
    return {
        Form: {
            ...Form,
            Buttons: props => {
                if (props.label === 'process.retrieve.form.destination.label') {
                    capture.destinationButtons = props
                }
                return null
            },
            PanelButtons: props => {
                capture.panelButtons = props
                return props.children
            }
        }
    }
})

const {MosaicRetrievePanel} = await import('./retrievePanel')

const roots = []

const band = (name, arrayDimensions, pyramidingPolicy) => ({
    name,
    dataType: {arrayDimensions},
    ...(pyramidingPolicy && {pyramidingPolicy})
})

const description = bands => ({
    executionReference: {type: 'RECIPE_REF', id: 'recipe-1'},
    output: {bands}
})

const ready = bands => ({
    status: 'READY',
    description: description(bands),
    diagnostics: [],
    error: null
})

const input = (name, value) => {
    const calls = []
    return {
        name,
        value,
        calls,
        set: vi.fn(next => calls.push(next))
    }
}

const inputs = ({bands = [], destination = 'DRIVE', useAllBands = false} = {}) => ({
    useAllBands: input('useAllBands', useAllBands),
    bands: input('bands', bands),
    scale: input('scale', 30),
    destination: input('destination', destination),
    workspacePath: input('workspacePath', 'exports'),
    assetId: input('assetId', 'users/me/output'),
    assetType: input('assetType', 'Image'),
    sharing: input('sharing', 'PRIVATE'),
    strategy: input('strategy', 'REPLACE'),
    shardSize: input('shardSize', 256),
    fileDimensionsMultiple: input('fileDimensionsMultiple', 10),
    tileSize: input('tileSize', 2),
    filenamePrefix: input('filenamePrefix', 'output'),
    crs: input('crs', 'EPSG:4326'),
    crsTransform: input('crsTransform', '')
})

const trackedResolution = () => {
    const subject = new Subject()
    const state = {subscriptions: 0, teardowns: 0}
    return {
        state,
        next: value => act(() => subject.next(value)),
        state$: new Observable(subscriber => {
            state.subscriptions++
            const subscription = subject.subscribe(subscriber)
            return () => {
                state.teardowns++
                subscription.unsubscribe()
            }
        })
    }
}

const baseProps = ({formInputs, imageOutputResolution, onRetrieve = vi.fn(), ...overrides} = {}) => ({
    allBands: false,
    allowTiling: false,
    bandOptions: [[
        {value: 'array', label: 'array'},
        {value: 'scalar', label: 'scalar'}
    ]],
    className: '',
    defaultAssetType: 'Image',
    defaultCrs: 'EPSG:4326',
    defaultFileDimensionsMultiple: 10,
    defaultScale: 30,
    defaultShardSize: 256,
    defaultTileSize: 2,
    form: {isInvalid: () => false},
    inputs: formInputs || inputs(),
    onRetrieve,
    projectId: null,
    projects: [],
    recipePlaceholder: 'recipe',
    recipeTitle: 'Recipe',
    scaleTicks: [10, 30],
    single: false,
    toDrive: true,
    toEE: true,
    toSepal: true,
    ...(imageOutputResolution && {imageOutputResolution}),
    ...overrides
})

const mount = initialProps => {
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    let props = initialProps
    const render = next => {
        props = next || props
        act(() => root.render(<MosaicRetrievePanel {...props}/>))
    }
    render()
    return {container, render, root}
}

const outputOperation = (key = {id: 'recipe-1'}) => {
    const resolution = trackedResolution()
    return {
        resolution,
        contract: {key, state$: resolution.state$}
    }
}

const option = value => capture.destinationButtons?.options.find(option => option.value === value)
const expectEnabled = (...values) => values.forEach(value => expect(option(value)?.disabled).not.toBe(true))
const expectDisabled = (...values) => values.forEach(value => expect(option(value)?.disabled).toBe(true))

beforeEach(() => {
    capture.destinationButtons = null
    capture.googleAccount = true
    capture.onApply = null
    capture.panelButtons = null
})

afterEach(() => {
    roots.splice(0).forEach(root => act(() => root.unmount()))
})

describe('resolved image-output destination compatibility', () => {
    it('keeps all-array destinations visible but disables Drive and SEPAL for an empty manual selection', () => {
        const {contract, resolution} = outputOperation()
        mount(baseProps({formInputs: inputs({bands: []}), imageOutputResolution: contract}))

        resolution.next(ready([band('first', 1, 'sample'), band('second', 2, 'sample')]))

        expect(capture.destinationButtons.disabled).not.toBe(true)
        expect(capture.destinationButtons.options.map(({value}) => value)).toEqual(['GEE', 'DRIVE', 'SEPAL'])
        expectEnabled('GEE')
        expectDisabled('DRIVE', 'SEPAL')
    })

    it('keeps Drive and SEPAL available for an empty manual selection when a verified scalar exists', () => {
        const {contract, resolution} = outputOperation()
        mount(baseProps({formInputs: inputs({bands: []}), imageOutputResolution: contract}))

        resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))

        expectEnabled('GEE', 'DRIVE', 'SEPAL')
    })

    it('permits every configured destination for a scalar-only manual selection', () => {
        const {contract, resolution} = outputOperation()
        mount(baseProps({formInputs: inputs({bands: ['scalar']}), imageOutputResolution: contract}))

        resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))

        expectEnabled('GEE', 'DRIVE', 'SEPAL')
    })

    it('switches a selected scalar-renderer destination to GEE when an array band is added', () => {
        const operation = outputOperation()
        const scalarInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs: scalarInputs, imageOutputResolution: operation.contract}))
        operation.resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        expect(scalarInputs.destination.set).not.toHaveBeenCalled()

        const mixedInputs = inputs({bands: ['scalar', 'array'], destination: 'DRIVE'})
        mounted.render(baseProps({formInputs: mixedInputs, imageOutputResolution: operation.contract}))

        expect(mixedInputs.destination.set).toHaveBeenCalledWith('GEE')
        expect(capture.panelButtons.invalid).toBe(true)
    })

    it('clears an invalid non-GEE destination when GEE is unavailable', () => {
        const operation = outputOperation()
        const formInputs = inputs({bands: ['array'], destination: 'DRIVE'})
        const mounted = mount(baseProps({
            formInputs,
            imageOutputResolution: operation.contract,
            toEE: false
        }))

        operation.resolution.next(ready([band('array', 1, 'sample')]))

        expect(formInputs.destination.set).toHaveBeenCalledWith(null)

        const clearedInputs = inputs({bands: ['array'], destination: null})
        mounted.render(baseProps({
            formInputs: clearedInputs,
            imageOutputResolution: operation.contract,
            toEE: false
        }))
        expect(clearedInputs.destination.set).not.toHaveBeenCalled()
    })

    it('re-enables non-GEE destinations after removing arrays without switching away from GEE', () => {
        const operation = outputOperation()
        const mixedInputs = inputs({bands: ['scalar', 'array'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs: mixedInputs, imageOutputResolution: operation.contract}))
        operation.resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        expect(mixedInputs.destination.set).toHaveBeenCalledWith('GEE')

        const scalarInputs = inputs({bands: ['scalar'], destination: 'GEE'})
        mounted.render(baseProps({formInputs: scalarInputs, imageOutputResolution: operation.contract}))

        expectEnabled('DRIVE', 'SEPAL')
        expect(scalarInputs.destination.set).not.toHaveBeenCalled()
    })

    it('permits only GEE when useAllBands covers a mixed schema', () => {
        const operation = outputOperation()
        mount(baseProps({
            formInputs: inputs({bands: ['scalar'], useAllBands: true}),
            imageOutputResolution: operation.contract
        }))

        operation.resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))

        expectEnabled('GEE')
        expectDisabled('DRIVE', 'SEPAL')
    })

    it('applies the allBands prop to a synchronously resolved schema during mount', () => {
        const formInputs = inputs({bands: [], destination: 'DRIVE', useAllBands: false})
        const terminal = ready([band('array', 1, 'sample'), band('scalar', 0)])

        mount(baseProps({
            allBands: true,
            formInputs,
            imageOutputResolution: {key: {id: 'recipe-1'}, state$: of(terminal)}
        }))

        expect(formInputs.useAllBands.set).toHaveBeenCalledWith(true)
        expectEnabled('GEE')
        expectDisabled('DRIVE', 'SEPAL')
        expect(formInputs.destination.set).toHaveBeenCalledWith('GEE')
    })

    it('permits all configured destinations when useAllBands covers only verified scalars', () => {
        const operation = outputOperation()
        mount(baseProps({
            formInputs: inputs({bands: [], useAllBands: true}),
            imageOutputResolution: operation.contract
        }))

        operation.resolution.next(ready([band('first', 0), band('second', 0)]))

        expectEnabled('GEE', 'DRIVE', 'SEPAL')
    })

    it.each([
        ['unknown dimensionality', [band('unknown', undefined, 'sample')], ['unknown']],
        ['a selected band absent from the description', [band('scalar', 0)], ['missing']]
    ])('fails closed for %s', (_name, outputBands, selectedBands) => {
        const operation = outputOperation()
        mount(baseProps({
            formInputs: inputs({bands: selectedBands}),
            imageOutputResolution: operation.contract
        }))

        operation.resolution.next(ready(outputBands))

        expectDisabled('GEE', 'DRIVE', 'SEPAL')
        expect(capture.panelButtons.invalid).toBe(true)
    })
})

describe('resolution and submission lifecycle', () => {
    it('disables the destination control without changing its selection until scalar output resolves', () => {
        const operation = outputOperation()
        const formInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        mount(baseProps({formInputs, imageOutputResolution: operation.contract}))

        expect(capture.destinationButtons.disabled).toBe(true)
        expect(formInputs.destination.value).toBe('DRIVE')
        expect(formInputs.destination.set).not.toHaveBeenCalled()

        operation.resolution.next(ready([band('scalar', 0)]))

        expect(capture.destinationButtons.disabled).not.toBe(true)
        expect(formInputs.destination.value).toBe('DRIVE')
        expect(formInputs.destination.set).not.toHaveBeenCalled()
    })

    it.each(['UNAVAILABLE', 'INVALID'])(
        'disables Apply and destination after %s without rendering the raw error',
        status => {
            const operation = outputOperation()
            const {container} = mount(baseProps({imageOutputResolution: operation.contract}))

            expect(capture.panelButtons.invalid).toBe(true)
            expect(capture.destinationButtons.disabled).toBe(true)
            operation.resolution.next({
                status,
                description: null,
                diagnostics: [],
                error: new Error('private transport detail')
            })
            expect(capture.panelButtons.invalid).toBe(true)
            expect(capture.destinationButtons.disabled).toBe(true)
            expect(container.textContent).not.toContain('private transport detail')
        }
    )

    it('prevents Apply from racing a stale destination during reconciliation', () => {
        const onRetrieve = vi.fn()
        const operation = outputOperation()
        const formInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs, imageOutputResolution: operation.contract, onRetrieve}))
        operation.resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))

        const changedInputs = inputs({bands: ['scalar', 'array'], destination: 'DRIVE'})
        mounted.render(baseProps({formInputs: changedInputs, imageOutputResolution: operation.contract, onRetrieve}))
        mounted.render(baseProps({formInputs: changedInputs, imageOutputResolution: operation.contract, onRetrieve}))
        if (!capture.panelButtons.invalid) {
            capture.onApply({fileDimensionsMultiple: 10, shardSize: 256})
        }

        expect(changedInputs.destination.set).toHaveBeenCalledWith('GEE')
        expect(changedInputs.destination.set).toHaveBeenCalledTimes(1)
        expect(onRetrieve).not.toHaveBeenCalled()
    })

    it('does not observe the source again when only band selection changes', () => {
        const operation = outputOperation()
        const mounted = mount(baseProps({
            formInputs: inputs({bands: ['scalar']}),
            imageOutputResolution: operation.contract
        }))
        operation.resolution.next(ready([band('array', 1, 'sample'), band('scalar', 0)]))

        mounted.render(baseProps({
            formInputs: inputs({bands: ['scalar', 'array']}),
            imageOutputResolution: operation.contract
        }))
        mounted.render(baseProps({
            formInputs: inputs({bands: ['scalar']}),
            imageOutputResolution: operation.contract
        }))

        expect(operation.resolution.state.subscriptions).toBe(1)
    })

    it('passes Apply a cached resolver that reuses the terminal snapshot after panel teardown', () => {
        const onRetrieve = vi.fn()
        const operation = outputOperation()
        const mounted = mount(baseProps({
            formInputs: inputs({bands: ['scalar'], destination: 'DRIVE'}),
            imageOutputResolution: operation.contract,
            onRetrieve
        }))
        const terminal = ready([band('scalar', 0)])
        operation.resolution.next(terminal)

        capture.onApply({fileDimensionsMultiple: 10, shardSize: 256})

        expect(onRetrieve).toHaveBeenCalledTimes(1)
        const resolutionContext = onRetrieve.mock.calls[0]?.[1]
        expect(resolutionContext?.resolveImageOutput$).toEqual(expect.any(Function))
        act(() => mounted.root.unmount())
        roots.splice(roots.indexOf(mounted.root), 1)
        const cached = []
        const error = vi.fn()
        const complete = vi.fn()
        let subscribing = true
        resolutionContext?.resolveImageOutput$({recipe: {id: 'ignored'}}).subscribe({
            next: value => {
                expect(subscribing).toBe(true)
                cached.push(value)
            },
            error,
            complete: () => {
                expect(subscribing).toBe(true)
                complete()
            }
        })
        subscribing = false
        expect(cached).toEqual([terminal])
        expect(error).not.toHaveBeenCalled()
        expect(complete).toHaveBeenCalledOnce()
        expect(operation.resolution.state.subscriptions).toBe(1)
    })

    it('cancels stale recipe resolution, replaces it, and tears down panel-owned work on unmount', () => {
        const first = outputOperation({id: 'first'})
        const second = outputOperation({id: 'second'})
        const formInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs, imageOutputResolution: first.contract}))
        expect(first.resolution.state.subscriptions).toBe(1)
        first.resolution.next(ready([band('scalar', 0)]))
        expect(capture.destinationButtons.disabled).not.toBe(true)

        mounted.render(baseProps({formInputs, imageOutputResolution: second.contract}))

        expect(first.resolution.state.teardowns).toBe(1)
        expect(second.resolution.state.subscriptions).toBe(1)
        expect(capture.destinationButtons.disabled).toBe(true)
        expect(formInputs.destination.set).not.toHaveBeenCalled()
        second.resolution.next(ready([band('scalar', 0)]))
        expect(capture.destinationButtons.disabled).not.toBe(true)
        act(() => mounted.root.unmount())
        roots.splice(roots.indexOf(mounted.root), 1)
        expect(second.resolution.state.teardowns).toBe(1)
    })

    it('preserves the existing destination and Apply behavior when no resolution contract is supplied', () => {
        const onRetrieve = vi.fn()
        mount(baseProps({
            formInputs: inputs({bands: ['anything'], destination: 'DRIVE'}),
            onRetrieve
        }))

        expect(capture.destinationButtons.disabled).not.toBe(true)
        expectEnabled('GEE', 'DRIVE', 'SEPAL')
        expect(capture.panelButtons.invalid).toBe(false)
        capture.onApply({fileDimensionsMultiple: 10, shardSize: 256})
        expect(onRetrieve).toHaveBeenCalledTimes(1)
        expect(onRetrieve.mock.calls[0]).toHaveLength(1)
    })
})
