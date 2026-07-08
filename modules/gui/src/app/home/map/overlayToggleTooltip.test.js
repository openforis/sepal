import {overlayToggleTooltipKey} from './overlayToggleTooltip'

describe('overlayToggleTooltipKey', () => {
    it('offers to hide a visible layer', () => {
        expect(overlayToggleTooltipKey({})).toBe('map.featureLayer.toggle.hide')
        expect(overlayToggleTooltipKey({disabled: false})).toBe('map.featureLayer.toggle.hide')
    })

    it('offers to show a hidden layer', () => {
        expect(overlayToggleTooltipKey({disabled: true})).toBe('map.featureLayer.toggle.show')
    })
})
