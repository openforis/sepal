import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The gee api is the boundary a replacement map-id request would cross. Faking it keeps the observable
// cold and lets a test see exactly which render arguments were sent.
const {geeCalls} = vi.hoisted(() => ({geeCalls: []}))
vi.mock('~/apiRegistry', () => ({
    default: {
        gee: {
            aoiGeometry$: args => (geeCalls.push(args), {args}),
            recipeGeometry$: args => (geeCalls.push(args), {args})
        }
    }
}))

import {TabContext} from '~/widget/tabs/tabContext'

import {AoiGeometryLayer} from './aoiGeometryLayer'
import {RecipeGeometryLayer} from './recipeGeometryLayer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const aoi = {type: 'ASSET', id: 'some/asset'}
const recipe = {ui: {initialized: true}, model: {aoi}}
const style = {color: '#FFFFFF', fillColor: '#FFFFFF1A', width: 2, opacity: 0.3}

// Mirrors SepalMap.setLayer: an equal layer is not remounted, so getLayer keeps returning the mounted one.
const fakeMap = () => {
    const mounted = {}
    const handed = []
    return {
        handed,
        getLayer: id => mounted[id],
        removeLayer: id => { delete mounted[id] },
        setLayer: ({id, layer}) => {
            handed.push(layer)
            const existing = mounted[id]
            if (existing && existing.equals(layer)) {
                return false
            }
            mounted[id] = layer
            return true
        }
    }
}

describe('aoi geometry layer lifecycle', () => {
    let mounted

    const mount = (Component, props) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        const render = props => act(() => {
            root.render(
                <TabContext id='tab' busyIn$={new Subject()} busyOut$={new Subject()}>
                    <Component {...props}/>
                </TabContext>
            )
        })
        render(props)
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return render
    }

    const aoiProps = (map, overrides = {}) => ({id: 'aoi', map, aoi, layerIndex: 1, ...style, ...overrides})
    const recipeProps = (map, overrides = {}) => ({id: 'aoi', map, recipe, layerIndex: 1, ...style, ...overrides})

    const cases = [
        ['AoiGeometryLayer', AoiGeometryLayer, aoiProps],
        ['RecipeGeometryLayer', RecipeGeometryLayer, recipeProps]
    ]

    beforeEach(() => {
        mounted = []
        geeCalls.length = 0
    })

    afterEach(() => {
        mounted.forEach(unmount => unmount())
    })

    cases.forEach(([name, Component, props]) => {
        describe(name, () => {
            it('sends the outline width to earth engine', () => {
                mount(Component, props(fakeMap()))

                expect(geeCalls.at(-1)).toMatchObject({color: '#FFFFFF', fillColor: '#FFFFFF1A', width: 2})
            })

            it('never sends whole-layer opacity to earth engine', () => {
                mount(Component, props(fakeMap()))

                expect(geeCalls.at(-1)).not.toHaveProperty('opacity')
            })

            it('replaces the layer when the outline width changes', () => {
                const map = fakeMap()
                const render = mount(Component, props(map))

                render(props(map, {width: 5}))

                expect(map.handed[0].equals(map.handed[1])).toBe(false)
            })

            it('replaces the layer when the colours change', () => {
                const map = fakeMap()
                const render = mount(Component, props(map))

                render(props(map, {color: '#FF0000', fillColor: '#FF000080'}))

                expect(map.handed[0].equals(map.handed[1])).toBe(false)
            })

            it('reuses the mounted layer and restyles it when only opacity changes', () => {
                const map = fakeMap()
                const render = mount(Component, props(map))
                const first = map.getLayer('aoi')

                render(props(map, {opacity: 0.9}))

                expect(map.handed[0].equals(map.handed[1])).toBe(true)
                expect(map.getLayer('aoi')).toBe(first)
                expect(first.opacity).toBe(0.9)
            })
        })
    })
})
