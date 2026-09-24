import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The Retrieve panel at its boundary: given its recipe's output read - as the panel's owner reads it for each render,
// and again for a submission - it decides which destinations and whether Apply are available, and submits through
// the task it is given. The read's acquisition is its owner's and is not under test here.

const capture = vi.hoisted(() => ({
    destinationButtons: null,
    googleAccount: true,
    onApply: null,
    panelButtons: null,
    read: null,
    rerender: null
}))

vi.mock('~/app/home/body/process/recipe/withRetrieveOutput', () => ({
    withRetrieveOutput: ({isImageOutput = () => true} = {}) => Component => props => isImageOutput(props)
        ? <Component {...props} retrieveOutput={capture.read} readRetrieveOutput={() => capture.read}/>
        : <Component {...props}/>
}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children, onApply}) => {
        capture.onApply = onApply
        return children
    },
    recipeFormPanel: () => Component => Component
}))

vi.mock('~/app/home/body/process/recipeList/projects', () => ({updateProject: vi.fn()}))
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

const RECIPE = {id: 'recipe-1', type: 'SYNTHETIC', model: {}}

const description = bands => ({
    executionReference: {type: 'RECIPE_REF', id: RECIPE.id},
    output: {bands}
})

// A described answer, as the common read gives one.
const ready = (bands, dependencyValidity = {status: 'VALID', diagnostics: []}) => ({
    recipe: RECIPE,
    pending: false,
    output: {
        status: 'READY',
        authority: 'DESCRIBED',
        description: description(bands),
        bands,
        presentation: {},
        availableBands: {},
        dependencyValidity,
        diagnostics: [],
        error: null,
        acquisition: null
    }
})

const failed = status => ({
    recipe: RECIPE,
    pending: false,
    output: {
        status,
        authority: null,
        description: null,
        bands: [],
        presentation: {},
        availableBands: {},
        dependencyValidity: null,
        diagnostics: [],
        error: new Error('private transport detail'),
        acquisition: {kind: 'DESCRIBE', key: {}}
    }
})

const resolving = () => ({
    recipe: RECIPE,
    pending: true,
    output: {...failed('NEEDS_EVIDENCE').output, error: null}
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

const baseProps = ({formInputs, submitTask = vi.fn(), ...overrides} = {}) => ({
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
    submitTask,
    // Every declared type's migration fallback, for its verified scalar bands.
    task: {fallbackPyramidingPolicy: {'.default': 'mean'}},
    projectId: null,
    projects: [],
    recipePlaceholder: 'recipe',
    recipeTitle: 'Recipe',
    scaleTicks: [10, 30],
    single: false,
    toDrive: true,
    toEE: true,
    toSepal: true,
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
    capture.rerender = () => render()
    render()
    return {container, render, root}
}

// The read answering, as the panel's owner re-renders it when its acquisition settles.
const answer = read => {
    capture.read = read
    act(() => capture.rerender())
}

const option = value => capture.destinationButtons?.options.find(option => option.value === value)

// An absent option is not an enabled one: the panel withholds the whole form while it is opening, and a
// missing control must fail this rather than pass it.
const expectEnabled = (...values) => values.forEach(value => {
    expect(option(value), `no ${value} destination option`).toBeDefined()
    expect(option(value).disabled).not.toBe(true)
})
const expectDisabled = (...values) => values.forEach(value => expect(option(value)?.disabled).toBe(true))

// The panel opens on a loading view held for a minimum, so a scenario about the ready form waits it out.
// Revealing needs an answer as well, so this alone never opens a panel whose resolution is still pending.
const MINIMUM_LOADING_MS = 500
const passMinimum = () => act(() => vi.advanceTimersByTime(MINIMUM_LOADING_MS + 50))

beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    capture.read = resolving()
    capture.rerender = null
    capture.destinationButtons = null
    capture.googleAccount = true
    capture.onApply = null
    capture.panelButtons = null
})

afterEach(() => {
    roots.splice(0).forEach(root => act(() => root.unmount()))
    vi.useRealTimers()
})

describe('resolved image-output destination compatibility', () => {
    it('keeps all-array destinations visible but disables Drive and SEPAL for an empty manual selection', () => {
        mount(baseProps({formInputs: inputs({bands: []})}))

        answer(ready([band('first', 1, 'sample'), band('second', 2, 'sample')]))
        passMinimum()

        expect(capture.destinationButtons.disabled).not.toBe(true)
        expect(capture.destinationButtons.options.map(({value}) => value)).toEqual(['GEE', 'DRIVE', 'SEPAL'])
        expectEnabled('GEE')
        expectDisabled('DRIVE', 'SEPAL')
    })

    it('keeps Drive and SEPAL available for an empty manual selection when a verified scalar exists', () => {
        mount(baseProps({formInputs: inputs({bands: []})}))

        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()

        expectEnabled('GEE', 'DRIVE', 'SEPAL')
    })

    it('permits every configured destination for a scalar-only manual selection', () => {
        mount(baseProps({formInputs: inputs({bands: ['scalar']})}))

        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()

        expectEnabled('GEE', 'DRIVE', 'SEPAL')
    })

    it('switches a selected scalar-renderer destination to GEE when an array band is added', () => {
        const scalarInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs: scalarInputs}))
        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()
        expect(scalarInputs.destination.set).not.toHaveBeenCalled()

        const mixedInputs = inputs({bands: ['scalar', 'array'], destination: 'DRIVE'})
        mounted.render(baseProps({formInputs: mixedInputs}))

        expect(mixedInputs.destination.set).toHaveBeenCalledWith('GEE')
        expect(capture.panelButtons.invalid).toBe(true)
    })

    it('clears an invalid non-GEE destination when GEE is unavailable', () => {
        const formInputs = inputs({bands: ['array'], destination: 'DRIVE'})
        const mounted = mount(baseProps({
            formInputs,
            toEE: false
        }))

        answer(ready([band('array', 1, 'sample')]))
        passMinimum()

        expect(formInputs.destination.set).toHaveBeenCalledWith(null)

        const clearedInputs = inputs({bands: ['array'], destination: null})
        mounted.render(baseProps({
            formInputs: clearedInputs,
            toEE: false
        }))
        expect(clearedInputs.destination.set).not.toHaveBeenCalled()
    })

    it('re-enables non-GEE destinations after removing arrays without switching away from GEE', () => {
        const mixedInputs = inputs({bands: ['scalar', 'array'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs: mixedInputs}))
        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()
        expect(mixedInputs.destination.set).toHaveBeenCalledWith('GEE')

        const scalarInputs = inputs({bands: ['scalar'], destination: 'GEE'})
        mounted.render(baseProps({formInputs: scalarInputs}))

        expectEnabled('DRIVE', 'SEPAL')
        expect(scalarInputs.destination.set).not.toHaveBeenCalled()
    })

    it('permits only GEE when useAllBands covers a mixed schema', () => {
        mount(baseProps({
            formInputs: inputs({bands: ['scalar'], useAllBands: true})
        }))

        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()

        expectEnabled('GEE')
        expectDisabled('DRIVE', 'SEPAL')
    })

    it('applies the allBands prop to a synchronously resolved schema during mount', () => {
        const formInputs = inputs({bands: [], destination: 'DRIVE', useAllBands: false})
        capture.read = ready([band('array', 1, 'sample'), band('scalar', 0)])

        mount(baseProps({allBands: true, formInputs}))
        passMinimum()

        expect(formInputs.useAllBands.set).toHaveBeenCalledWith(true)
        expectEnabled('GEE')
        expectDisabled('DRIVE', 'SEPAL')
        expect(formInputs.destination.set).toHaveBeenCalledWith('GEE')
    })

    it('permits all configured destinations when useAllBands covers only verified scalars', () => {
        mount(baseProps({
            formInputs: inputs({bands: [], useAllBands: true})
        }))

        answer(ready([band('first', 0), band('second', 0)]))
        passMinimum()

        expectEnabled('GEE', 'DRIVE', 'SEPAL')
    })

    it.each([
        ['unknown dimensionality', [band('unknown', undefined, 'sample')], ['unknown']],
        ['a selected band absent from the description', [band('scalar', 0)], ['missing']]
    ])('fails closed for %s, blocking Apply without clearing the destination', (_name, outputBands, selectedBands) => {
        mount(baseProps({
            formInputs: inputs({bands: selectedBands})
        }))

        answer(ready(outputBands))
        passMinimum()

        expect(capture.panelButtons.invalid).toBe(true)
        expect(capture.destinationButtons.value).not.toBe(null)
    })
})

describe('resolution and submission lifecycle', () => {
    it('withholds the destination control without changing its selection until scalar output resolves', () => {
        const formInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        mount(baseProps({formInputs}))

        expect(capture.destinationButtons).toBe(null)
        expect(capture.panelButtons.invalid).toBe(true)
        expect(formInputs.destination.value).toBe('DRIVE')
        expect(formInputs.destination.set).not.toHaveBeenCalled()

        // Waiting out the minimum reveals nothing on its own: the resolution has still not answered.
        passMinimum()

        expect(capture.destinationButtons).toBe(null)

        answer(ready([band('scalar', 0)]))

        expect(capture.destinationButtons.disabled).not.toBe(true)
        expect(formInputs.destination.value).toBe('DRIVE')
        expect(formInputs.destination.set).not.toHaveBeenCalled()
    })

    it.each(['UNAVAILABLE', 'INVALID'])(
        'disables Apply and destination after %s without rendering the raw error',
        status => {
            const {container} = mount(baseProps())

            expect(capture.panelButtons.invalid).toBe(true)
            expect(capture.destinationButtons).toBe(null)
            answer(failed(status))
            // Shown as soon as it arrives - the opening minimum is never waited out here.
            expect(capture.panelButtons.invalid).toBe(true)
            expect(capture.destinationButtons.disabled).toBe(true)
            expect(container.textContent).not.toContain('private transport detail')
        }
    )

    // A description is what the recipe's providers read; whether it can run depends on the whole closure.
    it.each([
        ['unsound', {status: 'INVALID', diagnostics: [{code: 'CYCLIC_DEPENDENCY'}]}],
        ['of unknown soundness', null]
    ])('disables Apply and destination for a description whose dependencies are %s', (_name, dependencyValidity) => {
        const submitTask = vi.fn()
        mount(baseProps({submitTask}))

        answer(ready([band('scalar', 0)], dependencyValidity))

        expect(capture.panelButtons.invalid).toBe(true)
        expect(capture.destinationButtons.disabled).toBe(true)
        expect(submitTask).not.toHaveBeenCalled()
    })

    it('prevents Apply from racing a stale destination during reconciliation', () => {
        const submitTask = vi.fn()
        const formInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        const mounted = mount(baseProps({formInputs, submitTask}))
        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()

        const changedInputs = inputs({bands: ['scalar', 'array'], destination: 'DRIVE'})
        mounted.render(baseProps({formInputs: changedInputs, submitTask}))
        mounted.render(baseProps({formInputs: changedInputs, submitTask}))
        if (!capture.panelButtons.invalid) {
            capture.onApply({bands: ['scalar', 'array'], destination: 'DRIVE', fileDimensionsMultiple: 10, shardSize: 256})
        }

        expect(changedInputs.destination.set).toHaveBeenCalledWith('GEE')
        expect(changedInputs.destination.set).toHaveBeenCalledTimes(1)
        expect(submitTask).not.toHaveBeenCalled()
    })

    it('submits the selection decided on, for the recipe the read holds', () => {
        const submitTask = vi.fn()
        mount(baseProps({formInputs: inputs({bands: ['scalar'], destination: 'DRIVE'}), submitTask}))
        answer(ready([band('array', 1, 'sample'), band('scalar', 0)]))
        passMinimum()

        capture.onApply({bands: ['scalar'], destination: 'DRIVE', fileDimensionsMultiple: 10, shardSize: 256})

        expect(submitTask).toHaveBeenCalledTimes(1)
        expect(submitTask.mock.calls[0][0]).toEqual({
            recipe: RECIPE,
            retrieveOptions: expect.objectContaining({bands: ['scalar'], destination: 'DRIVE', fileDimensions: 2560})
        })
    })

    // Apply decides from the session as it stands when applied, not from the render it was clicked in: a read that
    // has since become unanswered - the recipe edited, credentials replaced - submits nothing.
    it('submits nothing when the session has moved past the render Apply was clicked in', () => {
        const submitTask = vi.fn()
        mount(baseProps({formInputs: inputs({bands: ['scalar'], destination: 'DRIVE'}), submitTask}))
        answer(ready([band('scalar', 0)]))
        passMinimum()
        expect(capture.panelButtons.invalid).toBe(false)

        capture.read = resolving()
        capture.onApply({bands: ['scalar'], destination: 'DRIVE', fileDimensionsMultiple: 10, shardSize: 256})

        expect(submitTask).not.toHaveBeenCalled()
    })

    it('withholds its choices again, keeping the selection, when the read is acquired anew', () => {
        const formInputs = inputs({bands: ['scalar'], destination: 'DRIVE'})
        mount(baseProps({formInputs}))
        answer(ready([band('scalar', 0)]))
        passMinimum()
        expect(capture.destinationButtons.disabled).not.toBe(true)

        answer(resolving())

        expect(capture.destinationButtons.disabled).toBe(true)
        expect(capture.panelButtons.invalid).toBe(true)
        expect(formInputs.destination.set).not.toHaveBeenCalled()
        expect(formInputs.bands.set).not.toHaveBeenCalled()

        answer(ready([band('scalar', 0)]))

        expect(capture.destinationButtons.disabled).not.toBe(true)
    })

    it('reads nothing for a request that is not about the output, submitting it as the recipe type does', () => {
        const onRetrieve = vi.fn()
        const submitTask = vi.fn()
        mount(baseProps({
            formInputs: inputs({bands: ['anything'], destination: 'DRIVE'}),
            requestOptions: [[{value: 'anything', label: 'anything'}]],
            onRetrieve,
            submitTask
        }))

        expect(capture.destinationButtons.disabled).not.toBe(true)
        expectEnabled('GEE', 'DRIVE', 'SEPAL')
        expect(capture.panelButtons.invalid).toBe(false)
        capture.onApply({fileDimensionsMultiple: 10, shardSize: 256})
        expect(onRetrieve).toHaveBeenCalledTimes(1)
        expect(submitTask).not.toHaveBeenCalled()
    })
})
