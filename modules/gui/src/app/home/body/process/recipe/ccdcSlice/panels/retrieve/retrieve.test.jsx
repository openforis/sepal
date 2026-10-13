import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The Retrieve panel of CCDC Slice, on what it lets through. Its selection is structured - base bands, measures and
// segment bands - and every combination it asks for is checked against the slice's read of its own output: one the
// output does not hold is refused and named, never dropped from the export. Once the output has answered, a saved
// option it no longer offers goes from the selection. The read, the decision and the generic submitter are the real
// ones; the panel's form wrappers, its lower-level widgets, the task API and notifications are replaced.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))

const notified = vi.hoisted(() => [])
vi.mock('~/widget/notifications', () => ({Notifications: {error: message => notified.push(message)}}))

const submitted = vi.hoisted(() => [])
const capture = vi.hoisted(() => ({
    destinationButtons: null,
    folderFields: [],
    googleAccount: true,
    listDataFiles$: () => null,
    onApply: null
}))
vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                submitted.push(task)
                return {subscribe: () => {}}
            }
        },
        userData: {listFiles$: capture.listDataFiles$}
    }
}))

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children, onApply}) => {
        capture.onApply = onApply
        return children
    },
    recipeFormPanel: () => Component => Component
}))
vi.mock('~/user', async importOriginal => ({...await importOriginal(), isGoogleAccount: () => capture.googleAccount}))
vi.mock('~/widget/assetDestination', () => ({AssetDestination: () => null}))
vi.mock('~/widget/button', () => ({Button: () => null}))
vi.mock('~/widget/buttons', () => ({Buttons: () => null}))
vi.mock('~/widget/layout', () => ({Layout: ({children}) => children}))
vi.mock('~/widget/numberButtons', () => ({NumberButtons: () => null}))
vi.mock('~/widget/panel/panel', () => ({Panel: {Header: () => null, Content: ({children}) => children}}))
vi.mock('~/widget/workspaceDestination', () => ({
    WorkspaceDestination: props => {
        capture.folderFields.push(props)
        return null
    }
}))
vi.mock('~/widget/form', async importOriginal => {
    const {Form} = await importOriginal()
    return {
        Form: {
            ...Form,
            Input: () => null,
            Buttons: props => {
                if (props.label === 'process.retrieve.form.destination.label') {
                    capture.destinationButtons = props
                }
                return null
            },
            PanelButtons: ({children}) => children
        }
    }
})

vi.mock('~/app/home/body/process/recipeList/projects', () => ({updateProject: () => {}}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({getPreSetVisualizations: () => []})}))

const {sliceOutputBands} = await import('#sepal/recipe/type/ccdcSlice')
const {buildRecipeDependencyGraph} = await import('#sepal/recipe/source/dependencyGraph')
const {readRecipeOutput} = await import('../../../recipeOutput')
const {Retrieve} = await import('./retrieve')

describe('a selection the slice produces', () => {
    it('is submitted as the bands it asks for', () => {
        const instance = panel(describedRead())

        instance.retrieve(selecting({baseBands: ['ndvi'], bandTypes: ['value', 'rmse'], segmentBands: ['tStart']}))

        expect(submitted.map(({params}) => params.image.bands)).toEqual([{selection: ['ndvi', 'ndvi_rmse', 'tStart']}])
    })

    it('can be applied', () => {
        expect(panel(describedRead(), {baseBands: ['ndvi'], bandTypes: ['value']}).decision().status)
            .toBe('RETRIEVABLE')
    })
})

describe('a selection asking for a combination the slice does not produce', () => {
    const asking = {baseBands: ['ndvi', 'nbr'], bandTypes: ['value'], segmentBands: []}

    it('names it', () => {
        expect(panel(describedRead(), asking).decision().missingBandNames).toEqual(['nbr'])
    })

    it('submits nothing - not even the combinations it does produce', () => {
        panel(describedRead()).retrieve(selecting(asking))

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })
})

describe('a selection naming a measure the slice vocabulary does not know', () => {
    const asking = {baseBands: ['ndvi'], bandTypes: ['value', 'coefs'], segmentBands: []}

    it('is refused rather than read as another measure', () => {
        expect(panel(describedRead(), asking).decision()).toEqual(expect.objectContaining({
            status: 'BLOCKED',
            missingBandNames: ['coefs']
        }))
    })

    it('submits nothing', () => {
        panel(describedRead()).retrieve(selecting(asking))

        expect(submitted).toEqual([])
    })
})

describe('a saved selection once the slice has answered', () => {
    it('keeps the base bands and measures still offered, and drops the rest', () => {
        const instance = panel(describedRead(), {baseBands: ['ndvi', 'nbr'], bandTypes: ['value', 'coefs'], segmentBands: ['tStart']})

        instance.reconcileSelection()

        expect(changes(instance)).toEqual({baseBands: ['ndvi'], bandTypes: ['value']})
    })

    // Both options are offered, as nbr and as ndvi's rmse; only their combination is not. Dropping either would
    // export something else.
    it('leaves a combination the slice does not produce as saved, still named and refused', () => {
        const instance = panel(outputRead(['ndvi', 'ndvi_rmse', 'nbr', 'tStart']), {baseBands: ['ndvi', 'nbr'], bandTypes: ['value', 'rmse']})

        instance.reconcileSelection()

        expect(changes(instance)).toEqual({})
        expect(instance.decision().missingBandNames).toEqual(['nbr_rmse'])
    })

    it('is left as saved while the slice cannot be read', () => {
        const instance = panel(unavailableRead(), {baseBands: ['ndvi', 'nbr'], bandTypes: ['value']})

        instance.reconcileSelection()

        expect(changes(instance)).toEqual({})
    })
})

describe('the Data destination', () => {
    it('is offered to a user with a Google account', () => {
        show(describedRead(), {destination: null})

        expect(offeredDestinations()).toEqual(['GEE', 'DRIVE', 'SEPAL', 'DATA'])
    })

    it('is offered to a user without a Google account', () => {
        capture.googleAccount = false

        show(describedRead(), {destination: 'SEPAL'})

        expect(offeredDestinations()).toEqual(['SEPAL', 'DATA'])
    })

    it('asks for a Data folder, checked against Data and not browsable in the home', () => {
        const {inputs} = show(describedRead(), {destination: 'DATA'})

        expect(capture.folderFields.at(-1)).toEqual(expect.objectContaining({
            workspacePathInput: inputs.dataPath,
            destination: 'DATA',
            browse: false,
            listFiles$: capture.listDataFiles$,
            label: 'process.retrieve.form.dataPath.label'
        }))
    })

    it('submits the Data folder', () => {
        show(describedRead(), {destination: 'DATA'})

        capture.onApply({
            ...selecting({baseBands: ['ndvi'], bandTypes: ['value'], segmentBands: []}),
            destination: 'DATA',
            dataPath: 'exports/slice',
            fileDimensionsMultiple: 10,
            shardSize: 256
        })

        expect(submitted.map(({operation, params}) => ({operation, dataPath: params.image.dataPath})))
            .toEqual([{operation: 'image.DATA', dataPath: 'exports/slice'}])
    })
})

describe('an open panel whose source became unreachable', () => {
    it('cannot be applied', () => {
        expect(panel(unavailableRead(), {baseBands: ['ndvi'], bandTypes: ['value']}).decision().status).toBe('BLOCKED')
    })

    it('submits nothing if applied anyway', () => {
        panel(unavailableRead()).retrieve(selecting({baseBands: ['ndvi'], bandTypes: ['value'], segmentBands: []}))

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })
})

const roots = []

afterEach(() => {
    roots.splice(0).forEach(root => act(() => root.unmount()))
    capture.destinationButtons = null
    capture.folderFields = []
    capture.googleAccount = true
    capture.onApply = null
})

const SLICE = {
    id: 'slice-1',
    type: 'CCDC_SLICE',
    projectId: null,
    model: {
        source: {type: 'RECIPE_REF', id: 'ccdc-1'},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'MASK', harmonics: 3}
    },
    ui: {}
}

const SOURCE_BANDS = ['ndvi_coefs', 'ndvi_rmse', 'tStart']

// The slice's read once its acquisition holds a description: what its own derivation makes of the source's bands.
const describedRead = () => outputRead(sliceOutputBands(SOURCE_BANDS, SLICE.model))

const outputRead = names => readOf({
    status: 'READY',
    description: {
        executionReference: {type: 'RECIPE_REF', id: SLICE.id},
        output: {
            kind: 'IMAGE',
            bands: names.map(name => ({name, dataType: {arrayDimensions: 0}}))
        },
        evidence: []
    },
    diagnostics: [],
    error: null,
    dependencyValidity: {status: 'VALID', diagnostics: []}
})

const unavailableRead = () => readOf({
    status: 'UNAVAILABLE',
    description: null,
    diagnostics: [],
    error: new Error('Earth Engine is unreachable'),
    dependencyValidity: {status: 'VALID', diagnostics: []}
})

const readOf = terminal => {
    const graph = buildRecipeDependencyGraph({rootRecipe: SLICE, recipesById: new Map([[SLICE.id, SLICE]])})
    return {
        recipe: SLICE,
        output: readRecipeOutput({recipe: SLICE, product: {name: 'IMAGE_OUTPUT'}, graph, heldFor: () => terminal}),
        pending: false
    }
}

const selecting = selection => ({
    destination: 'GEE',
    assetType: 'Image',
    assetId: 'users/x/sliced',
    scale: 30,
    ...selection
})

const panel = (read, {baseBands = [], bandTypes = [], segmentBands = []} = {}) => {
    submitted.length = 0
    notified.length = 0
    const selectionInput = (field, value) => ({value, set: selected => instance.changes[field] = selected})
    const inputs = {
        baseBands: selectionInput('baseBands', baseBands),
        bandTypes: selectionInput('bandTypes', bandTypes),
        segmentBands: selectionInput('segmentBands', segmentBands),
        scale: {value: 30, set: () => {}}, destination: {value: 'GEE'}, assetType: {value: 'Image'}
    }
    const instance = new Retrieve({
        projectId: null,
        retrieveOutput: read,
        readRetrieveOutput: () => read,
        inputs,
        projects: [],
        form: {isInvalid: () => false}
    })
    instance.setState = state => Object.assign(instance.state, state)
    instance.changes = {}
    return instance
}

// What the panel set its selection fields to.
const changes = instance => instance.changes

const show = (read, {destination}) => {
    submitted.length = 0
    notified.length = 0
    const input = value => ({value, set: () => {}})
    const inputs = {
        baseBands: input([]), bandTypes: input([]), segmentBands: input([]), scale: input(30),
        destination: input(destination), workspacePath: input('downloads/slice'), dataPath: input('exports/slice'),
        assetId: input('users/x/sliced'), assetType: input('Image'), sharing: input('PRIVATE'), strategy: input('REPLACE'),
        shardSize: input(256), fileDimensionsMultiple: input(10), tileSize: input(2), crs: input('EPSG:4326'),
        crsTransform: input('')
    }
    const root = createRoot(document.createElement('div'))
    roots.push(root)
    act(() => root.render(
        <Retrieve
            projectId={null}
            retrieveOutput={read}
            readRetrieveOutput={() => read}
            inputs={inputs}
            projects={[]}
            form={{isInvalid: () => false}}
            defaultCrs='EPSG:4326'
            defaultScale={30}
            defaultShardSize={256}
            defaultFileDimensionsMultiple={10}
            defaultTileSize={2}
        />
    ))
    return {inputs}
}

const offeredDestinations = () => capture.destinationButtons.options.map(({value}) => value)
