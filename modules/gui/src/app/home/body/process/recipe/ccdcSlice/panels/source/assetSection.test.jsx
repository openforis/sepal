import {describe, expect, it, vi} from 'vitest'

// The date representation of a segments asset is configuration. The asset's own property is where it starts,
// and reopening a saved recipe is not a reason to start over: a recipe saved with Julian days must not be
// rewritten to whatever the asset says the next time its panel is opened.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => key}))

// The panel builds its field descriptors at module load, and the real Form barrel is not resolvable outside
// a mounted app. Only the shapes those descriptors need exist here; nothing renders.
vi.mock('~/widget/form', () => {
    class Field {
        notBlank() { return this }
        notEmpty() { return this }
        skip() { return this }
    }
    return {Form: Object.assign(() => null, {Field, AssetCombo: () => null, Buttons: () => null})}
})

vi.mock('~/widget/layout', () => ({Layout: () => null}))

const {AssetSection} = await import('./assetSection')

const CCDC_BANDS = [{id: 'ndvi_coefs'}, {id: 'ndvi_rmse'}, {id: 'ndvi_magnitude'}]

const metadataOf = dateFormat => ({bands: CCDC_BANDS, properties: {dateFormat}})

const panel = ({asset, dateFormat} = {}) => {
    const inputs = {
        asset: {value: asset, set: value => inputs.asset.value = value, setInvalid: () => {}},
        dateFormat: {value: dateFormat, set: value => inputs.dateFormat.value = value}
    }
    const instance = new AssetSection({inputs})
    instance.setState = state => Object.assign(instance.state, state)
    return {instance, inputs}
}

describe('reopening a panel on the asset it already had', () => {
    it('keeps the configured date representation', () => {
        const {instance, inputs} = panel({asset: 'users/x/segments', dateFormat: 0})

        instance.onLoaded({asset: 'users/x/segments', metadata: metadataOf(2)})

        expect(inputs.dateFormat.value).toBe(0)
    })

    it('takes the asset\'s own when nothing was configured', () => {
        const {instance, inputs} = panel({asset: 'users/x/segments'})

        instance.onLoaded({asset: 'users/x/segments', metadata: metadataOf(2)})

        expect(inputs.dateFormat.value).toBe(2)
    })
})

describe('selecting a different asset', () => {
    it('takes the new asset\'s date representation', () => {
        const {instance, inputs} = panel({asset: 'users/x/first', dateFormat: 0})
        inputs.asset.set('users/x/second')

        instance.onLoaded({asset: 'users/x/second', metadata: metadataOf(2)})

        expect(inputs.dateFormat.value).toBe(2)
    })

    // Zero is Julian days, a value, not an absence.
    it('takes a zero the new asset declares', () => {
        const {instance, inputs} = panel({asset: 'users/x/first', dateFormat: 1})
        inputs.asset.set('users/x/second')

        instance.onLoaded({asset: 'users/x/second', metadata: metadataOf(0)})

        expect(inputs.dateFormat.value).toBe(0)
    })

    it('leaves what was configured when the new asset declares nothing', () => {
        const {instance, inputs} = panel({asset: 'users/x/first', dateFormat: 1})
        inputs.asset.set('users/x/second')

        instance.onLoaded({asset: 'users/x/second', metadata: metadataOf(undefined)})

        expect(inputs.dateFormat.value).toBe(1)
    })
})

// Two reads can be in flight when a user changes their mind, and they need not answer in order.
describe('an answer about an asset the panel no longer names', () => {
    it('is ignored', () => {
        const {instance, inputs} = panel({asset: 'users/x/second', dateFormat: 0})

        instance.onLoaded({asset: 'users/x/first', metadata: metadataOf(2)})

        expect(inputs.dateFormat.value).toBe(0)
    })
})
