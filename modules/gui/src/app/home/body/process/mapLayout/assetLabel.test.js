import {defaultAssetLabel, resolveAssetLabel} from './assetLabel'

describe('defaultAssetLabel', () => {
    it('prefers system:title', () => {
        expect(defaultAssetLabel('projects/p/assets/foo_bar', {properties: {'system:title': 'Nice title'}})).toBe('Nice title')
    })

    it('falls back to metadata.title', () => {
        expect(defaultAssetLabel('projects/p/assets/foo_bar', {title: 'The title'})).toBe('The title')
    })

    it('falls back to the asset basename', () => {
        expect(defaultAssetLabel('projects/p/assets/foo_bar', {})).toBe('foo_bar')
        expect(defaultAssetLabel('projects/p/assets/foo_bar', undefined)).toBe('foo_bar')
    })
})

describe('resolveAssetLabel', () => {
    it('uses the default for a newly selected asset', () => {
        expect(resolveAssetLabel({current: '', asset: 'a', labeledAsset: undefined, defaultLabel: 'A'})).toBe('A')
    })

    it('keeps a user edit when the same asset reloads', () => {
        expect(resolveAssetLabel({current: 'my edit', asset: 'a', labeledAsset: 'a', defaultLabel: 'A'})).toBe('my edit')
    })

    it('resets to the new default on asset change, not leaking the previous custom label', () => {
        expect(resolveAssetLabel({current: 'my edit', asset: 'b', labeledAsset: 'a', defaultLabel: 'B'})).toBe('B')
    })
})
