import {cacheVenvArg} from './apps.js'

describe('cacheVenvArg', () => {
    test('a real boolean true enables caching', () => {
        expect(cacheVenvArg({cacheVenv: true})).toBe('true')
    })
    test('an absent field disables caching', () => {
        expect(cacheVenvArg({})).toBe('false')
    })
    test('a boolean false disables caching', () => {
        expect(cacheVenvArg({cacheVenv: false})).toBe('false')
    })
    // The catalog is external input: a JSON string is not a boolean and must not opt an app in.
    test('the string "true" does not enable caching', () => {
        expect(cacheVenvArg({cacheVenv: 'true'})).toBe('false')
    })
    test('the number 1 does not enable caching', () => {
        expect(cacheVenvArg({cacheVenv: 1})).toBe('false')
    })
    test('null does not enable caching', () => {
        expect(cacheVenvArg({cacheVenv: null})).toBe('false')
    })
})
