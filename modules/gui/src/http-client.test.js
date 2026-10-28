import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {get$, postJson$} from '~/http-client'

let requests

class FakeXHR {
    constructor() {
        this.headers = {}
        requests.push(this)
    }
    open(method, url) {
        this.method = method
        this.url = url
    }
    setRequestHeader(key, value) {
        this.headers[key] = value
    }
    send() {}
    abort() {}
    addEventListener() {}
    removeEventListener() {}
}

const request = (request$ = {}) => {
    request$.subscribe({next: () => {}, error: () => {}})
    return requests[0]
}

describe('http-client responseType', () => {
    beforeEach(() => {
        requests = []
        vi.stubGlobal('XMLHttpRequest', FakeXHR)
    })

    afterEach(() => vi.unstubAllGlobals())

    it('defaults to json', () => {
        expect(request(get$('/api/thing')).responseType).toBe('json')
    })

    it('passes text through', () => {
        expect(request(get$('/api/thing', {responseType: 'text'})).responseType).toBe('text')
    })

    it('passes blob through', () => {
        expect(request(get$('/api/tile', {responseType: 'blob'})).responseType).toBe('blob')
    })

    it('normalizes arrayBuffer to the XHR spelling', () => {
        expect(request(get$('/api/thing', {responseType: 'arrayBuffer'})).responseType).toBe('arraybuffer')
    })

    it('accepts the XHR spelling of arraybuffer', () => {
        expect(request(get$('/api/thing', {responseType: 'arraybuffer'})).responseType).toBe('arraybuffer')
    })

    it('applies to other verbs than get', () => {
        expect(request(postJson$('/api/thing', {body: {a: 1}, responseType: 'text'})).responseType).toBe('text')
    })

    it('rejects an unsupported responseType instead of silently falling back to text', () => {
        expect(() => get$('/api/thing', {responseType: 'bogus'})).toThrow(/Unsupported responseType: bogus/)
    })

    it('does not send responseType as a request option to the server', () => {
        const xhr = request(get$('/api/thing', {responseType: 'text'}))
        expect(xhr.url).toBe('/api/thing')
    })
})
