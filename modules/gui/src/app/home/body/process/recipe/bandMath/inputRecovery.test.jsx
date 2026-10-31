import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {asapScheduler, NEVER, observeOn, of, Subject} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {deserialize, serialize} from '~/serialize'
import {initStore} from '~/store'
import lookStyles from '~/style/look.module.css'
import {ActivationContext} from '~/widget/activation/activationContext'

// Real input add/remove/apply and Sync over saved-model-shaped references. Source observations are synthetic;
// readiness, section feedback and the downstream gates are the real shared reads.
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset, recipe, includeDataTypes}) => of((asset || recipe?.id === SOURCE ? ['red', 'nir'] : ['expr', 'mean'])
            .map(name => includeDataTypes ? {name, arrayDimensions: 0} : name)),
        assetMetadata$: () => of({type: 'Image', bandNames: ['red', 'nir'],
            bands: ['red', 'nir'].map(id => ({id, data_type: {type: 'PixelType', precision: 'float'}})), properties: {}}
        ).pipe(observeOn(asapScheduler)),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {save$: () => NEVER, load$: () => of(sourceRecipe()), loadAll$: () => of([])}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
const preview = vi.hoisted(() => ({shown: null}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({EarthEngineImageLayer: class {
    constructor({previewRequest, watchedProps}) {
        this.previewRequest = previewRequest
        this.watchedProps = watchedProps
    }
    removeFromMap() {}
}}))

const {addRecipeType} = await import('../../recipeTypeRegistry')
const {default: bandMath} = await import('./bandMath')
const {default: remapping} = await import('../remapping/remapping')
const {default: stack} = await import('../stack/stack')
const {BandMathToolbar} = await import('./panels/bandMathToolbar')
const {Sync} = await import('./sync/sync')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {readImageOutput} = await import('#sepal/recipe/output/readImageOutput')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {requestGate} = await import('../sourceRequirements')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')
const {retrieveAvailability} = await import('../operationAvailability')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {getPreSetVisualizations} = await import('../remapping/visualizations')
const {TabContext} = await import('~/widget/tabs/tabContext')
addRecipeType(bandMath())
addRecipeType(remapping())
addRecipeType(stack())
addRecipeImageLayer('REMAPPING', ({layer}) => {
    preview.shown = layer
    return null
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const ID = 'math'
const SOURCE = 'users/x/source'
const OTHER = 'users/x/other'
const IMG = 'process.panels.inputImagery.button'
let root, container, store
afterEach(async () => close())

describe.each(['ASSET', 'RECIPE_REF'])('restoring a %s input', type => {
    it.each([false, true])('restores both reference kinds and calculated outputs, save/reopen=%s', async reopen => {
        const saved = fixture(type)
        await open(saved)
        expectAvailable(true)
        expect(preview.shown).toBeTruthy()
        await removeInput(type)
        expectAvailable(false)
        expect(preview.shown).toBeNull()
        expect(calculations().map(c => c.imageId)).toEqual(['expression', 'reducer'])
        expect(calculations()[0].expression).toBe('i1.red * 2')
        if (reopen) await reopenSaved()
        const before = calculations()
        await draftInput(type, SOURCE, ['red'])
        expect(calculations()).toEqual(before)
        expectAvailable(false)
        // Observe the apply action itself, before mounted Sync can publish anything else.
        const applied = []
        const unsubscribe = store.subscribe(() => {
            if (images().some(image => image.id === SOURCE && image.type === type)) applied.push(model())
        })
        await press('button.apply')
        unsubscribe()
        const restored = images().find(image => image.id === SOURCE)
        expect(restored.imageId).not.toBe('old-input')
        expect(restored.name).toBe('i1')
        expect(applied[0].calculations.calculations[1].usedBands[0].imageId).toBe(restored.imageId)
        expect(calculations()[0].expression).toBe(saved.model.calculations.calculations[0].expression)
        expect(calculations()[1]).toMatchObject({reducer: 'mean', dataType: 'float', bandName: 'mean',
            usedBands: [{imageId: restored.imageId, imageName: 'i1', name: 'red'}]})
        expect(model().outputBands).toEqual(saved.model.outputBands)
        expectAvailable(true)
        expect(preview.shown).toBeTruthy()
        // Another applied edit forces normal derivation, which must not replace calculated output identities/names.
        await click(innermost(type === 'ASSET' ? SOURCE : 'Source recipe'))
        await addBand('nir')
        await press('button.apply')
        expect(model().outputBands).toEqual(saved.model.outputBands)
        expectAvailable(true)
    })
})

it('keeps missing reducer chips on opening and Cancel, and clears them after automatic source recovery', async () => {
    await open(fixture())
    await removeInput()
    const removed = calculations()
    await press('process.bandMath.panel.calculations.button')
    await click(innermost('mean'))
    let chip = button('red')
    expect(chip.className).toContain(lookStyles.cancel)
    expect(button('button.apply').disabled).toBe(true)
    expect(calculations()).toEqual(removed)
    await press('button.cancel')
    expect(calculations()).toEqual(removed)
    expectAvailable(false)
    await press(IMG)
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.apply')
    expectAvailable(true)
    await press('process.bandMath.panel.calculations.button')
    await click(innermost('mean'))
    chip = button('red')
    expect(chip.className).not.toContain(lookStyles.cancel)
    expect(button('button.apply').disabled).toBe(false)
    expect(calculations()[1].usedBands[0].name).toBe('red')
})

it('reconnects without the required band, stays invalid, then recovers when that band is included', async () => {
    const saved = fixture()
    await open(saved)
    await removeInput()
    await draftInput('ASSET', SOURCE, ['nir'])
    await press('button.apply')
    expect(shared().readiness.findings.flatMap(({problems}) => problems).map(({code}) => code)).toEqual(['UNKNOWN_BAND', 'UNKNOWN_BAND'])
    expectAvailable(false)
    await reopenSaved()
    await click(innermost(SOURCE))
    await addBand('red')
    await press('button.apply')
    expectAvailable(true)
    expect(model().outputBands).toEqual(saved.model.outputBands)
})

it.each([['ASSET', OTHER], ['RECIPE_REF', SOURCE]])('does not reconnect a different source %s:%s with identical bands', async (type, source) => {
    await open(fixture())
    await removeInput()
    await draftInput(type, source, ['red'])
    await press('button.apply')
    expect(images().at(-1).name).toBe('i3')
    expect(calculations()[0].expression).toBe('i1.red * 2')
    expect(calculations()[1].usedBands[0].imageId).toBe('old-input')
    expectAvailable(false)
})

it('Cancel preserves the saved error and references', async () => {
    await open(fixture())
    await removeInput()
    const saved = model()
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.cancel')
    expect(model()).toEqual(saved)
    expectAvailable(false)
})

it('refreshes retained identity on an applied source change', async () => {
    await open(fixture())
    await click(innermost(SOURCE))
    await selectAsset(OTHER)
    await press('button.apply')
    await removeInput('ASSET', OTHER)
    await reopenSaved()
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.apply')
    expectAvailable(false)
    expect(images().at(-1).name).toBe('i3')
    await removeInput()
    await draftInput('ASSET', OTHER, ['red'])
    await press('button.apply')
    expect(images().at(-1).name).toBe('i1')
    expectAvailable(true)
})

it.each(['input', 'calculation'])('does not steal a name occupied by another %s or reconnect around it', async owner => {
    await open(fixture())
    await removeInput()
    const saved = savedRecipe()
    if (owner === 'input') saved.model.inputImagery.images[0].name = 'i1'
    else saved.model.calculations.calculations[1].name = 'i1'
    const occupied = saved.model.inputImagery.images[0]
    await close()
    await open(saved)
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.apply')
    expect(images().map(({name}) => name)).toEqual(owner === 'input' ? ['i1', 'i2'] : ['i2', 'i3'])
    expect(images()[0]).toEqual(occupied)
    expect(calculations()[0].expression).toBe('i1.red * 2')
    expect(calculations()[1].usedBands[0].imageId).toBe('old-input')
    expectAvailable(false)
})

it('leaves a reference removed while its source was ambiguous unrecovered', async () => {
    const saved = fixture()
    saved.model.inputImagery.images.unshift({...saved.model.inputImagery.images[0], imageId: 'duplicate', name: 'i3'})
    await open(saved)
    await removeInput()
    await removeInput()
    await reopenSaved()
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.apply')
    expect(calculations()[1].usedBands[0].imageId).toBe('old-input')
    expectAvailable(false)
})

it.each([undefined, {id: SOURCE}])('cannot infer an orphaned source from absent or malformed metadata: %s', async imageSource => {
    const saved = fixture()
    saved.model.inputImagery.images.shift()
    saved.model.calculations.calculations.forEach(calculation => calculation.usedBands[0].imageSource = imageSource)
    await open(saved)
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.apply')
    expect(images().at(-1).name).toBe('i3')
    expect(calculations()[1].usedBands[0].imageId).toBe('old-input')
    expectAvailable(false)
})

it('keeps an explicitly edited new input name instead of rewriting expressions to recover', async () => {
    await open(fixture())
    await removeInput()
    await draftInput('ASSET', SOURCE, ['red'])
    const nameInput = field('process.bandMath.panel.inputImagery.name.label').querySelector('input')
    expect(nameInput.value).toBe('i1')
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nameInput, 'custom')
        nameInput.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await press('button.apply')
    expect(images().at(-1).name).toBe('custom')
    expect(calculations()[0].expression).toBe('i1.red * 2')
    expect(calculations()[1].usedBands[0].imageId).toBe('old-input')
    expectAvailable(false)
})

it('does not restore deleted direct outputs or change an unrelated calculation', async () => {
    const saved = fixture()
    const unrelated = {imageId: 'unrelated', name: 'c3', type: 'EXPRESSION', expression: 'i2.nir + 5',
        usedBands: [{...band('nir-id', 'nir'), imageId: 'remaining', imageName: 'i2'}],
        includedBands: [{...band('nir-id', 'nir'), imageId: 'remaining', imageName: 'i2'}], dataType: 'auto'}
    saved.model.calculations.calculations.push(unrelated)
    saved.model.outputBands.outputImages.push({imageId: 'old-input', name: 'i1', outputBands: [
        {...band('red-id', 'red'), defaultOutputName: 'red', outputName: 'direct_custom'}
    ]})
    await open(saved)
    await removeInput()
    const remainingOutputs = model().outputBands
    const unchanged = calculations()[2]
    await draftInput('ASSET', SOURCE, ['red'])
    await press('button.apply')
    expect(model().outputBands).toEqual(remainingOutputs)
    expect(model().outputBands.outputImages.map(({imageId}) => imageId)).toEqual(['expression', 'reducer'])
    expect(calculations()[2]).toEqual(unchanged)
    expectAvailable(true)
})

it('retains references added by whole-image derivation before removing the input', async () => {
    const saved = fixture()
    Object.assign(saved.model.calculations.calculations[0], {expression: 'i1 * 2', bandRenameStrategy: 'PREFIX', bandRename: 's_'})
    saved.model.calculations.calculations[0].includedBands = [{...saved.model.calculations.calculations[0].includedBands[0], name: 's_red'}]
    saved.model.outputBands.outputImages[0].outputBands[0].name = 's_red'
    await open(saved)
    await click(innermost(SOURCE))
    await addBand('nir')
    await press('button.apply')
    // Sync derived another output, but the editor's original usedBands snapshot still held only red.
    expect(calculations()[0].includedBands.map(({name}) => name)).toEqual(['s_red', 's_nir'])
    const outputs = model().outputBands
    await removeInput()
    expect(calculations()[0].usedBands.map(({name}) => name)).toEqual(['red', 'nir'])
    await draftInput('ASSET', SOURCE, ['red', 'nir'])
    await press('button.apply')
    expect(calculations()[0].expression).toBe('i1 * 2')
    expect(model().outputBands).toEqual(outputs)
    expect(images().at(-1).includedBands.map(({id}) => id)).toEqual(calculations()[0].includedBands.map(({id}) => id))
})

const band = (id, name) => ({id, name, type: 'continuous', legendEntries: []})
const input = (imageId, name, type, id, includedBands) => ({imageId, name, type, id, includedBands,
    bands: Object.fromEntries(includedBands.map(({name}) => [name, {}])), visualizations: []})
const fixture = (type = 'ASSET') => {
    const red = {...band('red-id', 'red'), imageId: 'old-input', imageName: 'i1'}
    const mean = {...band('mean-id', 'mean'), imageId: 'reducer', imageName: 'c2'}
    return {id: ID, type: 'BAND_MATH', revision: 1, ui: {initialized: true}, model: {
        inputImagery: {images: [input('old-input', 'i1', type, SOURCE, [band('red-id', 'red')]),
            input('remaining', 'i2', 'ASSET', 'users/x/remaining', [band('nir-id', 'nir')])]},
        calculations: {calculations: [
            {imageId: 'expression', name: 'c1', type: 'EXPRESSION', expression: 'i1.red * 2', dataType: 'float',
                usedBands: [red], includedBands: [red]},
            {imageId: 'reducer', name: 'c2', type: 'FUNCTION', reducer: 'mean', dataType: 'float', bandName: 'mean',
                usedBands: [red], includedBands: [mean]}
        ]},
        outputBands: {outputImages: [
            {imageId: 'expression', name: 'c1', outputBands: [{...red, outputName: 'expr', defaultOutputName: 'red'}]},
            {imageId: 'reducer', name: 'c2', outputBands: [{...mean, outputName: 'mean', defaultOutputName: 'mean'}]}
        ]}
    }}
}
const sourceRecipe = () => ({id: SOURCE, type: 'STACK', revision: 1, ui: {initialized: true}, model: {
    inputImagery: {images: [{imageId: 'source', type: 'ASSET', id: 'users/x/base', includedBands: [{band: 'red'}, {band: 'nir'}]}]},
    bandNames: {bandNames: [{imageId: 'source', bands: ['red', 'nir'].map(name => ({originalName: name, outputName: name}))}]}
}})
const downstream = {id: 'over', type: 'REMAPPING', revision: 1, ui: {initialized: true}, model: {
    inputImagery: {images: [{imageId: 'math', type: 'RECIPE_REF', id: ID, includedBands: [{band: 'expr'}]}]},
    legend: {entries: [{id: 'one', value: 1, label: 'One', color: '#123456', constraints: []}]}
}}
const recipe = () => store.getState().process.loadedRecipes[ID]
const model = () => recipe().model
const images = () => model().inputImagery.images
const calculations = () => model().calculations.calculations
const savedRecipe = () => deserialize(serialize(recipe()))
const shared = (target = recipe()) => readImageOutput({
    graph: buildMapDependencyGraph({recipe: target, loadedRecipes: store.getState().process.loadedRecipes}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type),
    observationFor: ({type}) => ({bands: (type === 'ASSET' ? ['red', 'nir'] : ['expr', 'mean'])
        .map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []})
})
function expectAvailable(available) {
    for (const target of [recipe(), downstream]) {
        const output = shared(target)
        const context = {state: store.getState(), recipe: target, heldFor: () => output}
        expect(output.readiness.status).toBe(available ? 'READY' : 'NOT_READY')
        expect(retrieveAvailability(context).available).toBe(available)
        expect(Boolean(requestGate({...context, operation: 'IMAGE_OUTPUT'}))).toBe(!available)
        const marks = sourceProblemsOfState(context.state, target.id, undefined, Date.now(), context.heldFor)
        // The diagnosis stays with Band Math; the dependent only marks its input on it.
        expect(marks).toEqual(available ? {} : target.id === ID
            ? {calculations: expect.anything()}
            : {inputImagery: expect.stringContaining('process.source.status.recipeNeedsAttention')})
    }
}
async function open(saved) {
    preview.shown = null
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {loadedRecipes: {[ID]: saved, [SOURCE]: sourceRecipe(), over: downstream},
            recipes: [{id: ID, type: 'BAND_MATH', name: 'Math', revision: 1},
                {id: SOURCE, type: 'STACK', name: 'Source recipe', revision: 1},
                {id: 'over', type: 'REMAPPING', name: 'Over', revision: 1}],
            recipeListing: {checkedAt: Date.now()}, saveStates: {}, folders: [], tabs: [{id: ID}, {id: SOURCE}]},
        assets: {user: [SOURCE, OTHER, 'users/x/remaining'].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}><ActivationContext id='root'><SourceRuntimeProvider>
        <Recipe id={ID}><Sync/>
            <TabContext id={ID} busyIn$={new Subject()}>
                <RecipeImageLayer source={{id: 'over-layer', sourceConfig: {recipeId: 'over'}}}
                    layerConfig={{visParams: getPreSetVisualizations(downstream)[0]}} map={{}}/>
            </TabContext>
            <EventShield><PortalContainer/><PortalContainer id='panels'/><PortalContext id='panels'>
                <BandMathToolbar/>
            </PortalContext></EventShield></Recipe>
    </SourceRuntimeProvider></ActivationContext></Provider>))
    await settled()
    await press(IMG)
}
async function close() {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
}
async function reopenSaved() {
    const saved = savedRecipe()
    await close()
    await open(saved)
}
async function removeInput(type = 'ASSET', source = SOURCE) {
    let row = innermost(type === 'ASSET' ? source : 'Source recipe')
    while (!row.querySelector('svg[data-icon="trash"]')) row = row.parentElement
    await pressFully(row.querySelector('svg[data-icon="trash"]').closest('button'))
    await pressFully(button('button.remove'))
}
async function draftInput(type, source, bands) {
    await press('button.add')
    if (type === 'RECIPE_REF') {
        await press('process.sourceType.RECIPE')
        await click(field('widget.recipeInput.label').querySelector('input'))
        await click(option('Source recipe'))
    } else await selectAsset(source)
    for (const band of bands) await addBand(band)
}
async function selectAsset(source) {
    const picker = field('process.classChange.panel.inputImage.asset.label').querySelector('input')
    await click(picker)
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(picker, source)
        picker.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await click(option(source))
}
async function addBand(name) {
    if (!document.querySelector('input[placeholder="process.classification.panel.inputImagery.bandSetSpec.addBands.placeholder"]')) {
        await click(document.querySelector('svg[data-icon="plus"]').closest('button'))
    }
    await click(option(name))
}
const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.includes(label))
const field = label => document.querySelector(`[data-label="${label}"]`)
const option = label => [...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent === label)
const innermost = text => [...document.querySelectorAll('*')]
    .filter(element => element.textContent === text && ![...element.children].some(child => child.textContent === text)).pop()
const press = label => click(button(label))
async function click(element) {
    expect(element).toBeTruthy()
    await act(async () => element.click())
    await settled()
}
async function pressFully(element) {
    await act(async () => ['mouseenter', 'mousedown', 'mouseup', 'click']
        .forEach(type => element.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    await settled()
}
async function settled() {
    for (let i = 0; i < 5; i++) await act(async () => {})
}
