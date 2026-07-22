import {EarthEngineTableLayer} from './earthEngineTableLayer'

const watchedProps = () => ({tableId: 't1', columnName: 'stratum', style: {colorMode: 'ONE_COLOR', color: '#111'}, width: 1})

const layer = ({opacity = 1, watched = watchedProps()} = {}) =>
    new EarthEngineTableLayer({map: {}, mapId$: {}, watchedProps: watched, opacity})

describe('EarthEngineTableLayer.equals', () => {
    it('is equal when only opacity differs (opacity is not a watched prop)', () => {
        // Opacity-only change stays equal -> sepalMap.setLayer won't recreate the layer or request a new map
        // id (no eeTableMap$).
        expect(layer({opacity: 1}).equals(layer({opacity: 0.3}))).toBe(true)
    })

    it('is not equal when a watched prop differs', () => {
        const other = layer({watched: {...watchedProps(), width: 5}})
        expect(layer().equals(other)).toBe(false)
    })

    it('is not equal when the style changes', () => {
        const other = layer({watched: {...watchedProps(), style: {colorMode: 'COLORS_BY_VALUE'}}})
        expect(layer().equals(other)).toBe(false)
    })

    it('is not equal when the feature filter changes', () => {
        const featureFilter = {booleanOperator: 'and', constraints: [{property: 'class', operator: '=', value: 'forest'}]}
        const other = layer({watched: {...watchedProps(), featureFilter}})
        expect(layer().equals(other)).toBe(false)
    })
})

describe('EarthEngineTableLayer.setOpacity', () => {
    it('updates its own opacity field and delegates to the overlay when mounted', () => {
        const l = layer({opacity: 1})
        const setOpacity = []
        l.overlay = {setOpacity: opacity => setOpacity.push(opacity)}
        l.setOpacity(0.4)
        expect(l.opacity).toBe(0.4)
        expect(setOpacity).toEqual([0.4])
    })

    it('updates the field without throwing when no overlay is mounted yet', () => {
        const l = layer({opacity: 1})
        l.setOpacity(0.6)
        expect(l.opacity).toBe(0.6)
    })
})
