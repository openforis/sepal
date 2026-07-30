import {assetDisplayLabel, defaultAssetLabel, resolveAssetLabel} from './assetLabel'

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

describe('assetDisplayLabel', () => {
    const asset = 'projects/my-project/assets/some_collection/foo_bar'

    it('prefers an explicit non-blank label', () => {
        expect(assetDisplayLabel({label: 'My layer', asset})).toBe('My layer')
    })

    it('trims and ignores a blank label, falling back', () => {
        expect(assetDisplayLabel({label: '   ', asset})).toBe('foo_bar')
        expect(assetDisplayLabel({label: undefined, asset})).toBe('foo_bar')
    })

    it('falls back to the metadata title (legacy source without a label)', () => {
        expect(assetDisplayLabel({asset, metadata: {properties: {'system:title': 'Nice title'}}})).toBe('Nice title')
        expect(assetDisplayLabel({asset, metadata: {title: 'The title'}})).toBe('The title')
    })

    it('falls back to the asset basename, never the full EE asset id', () => {
        const label = assetDisplayLabel({asset})
        expect(label).toBe('foo_bar')
        expect(label).not.toContain('/')
    })

    it('returns an asset with no slash as-is', () => {
        expect(assetDisplayLabel({asset: 'bare_name'})).toBe('bare_name')
    })

    it('handles a missing asset without throwing', () => {
        expect(assetDisplayLabel({})).toBe('')
        expect(assetDisplayLabel()).toBe('')
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
