import {canonicalJson} from './canonicalJson.js'

// The SHA-256 digest of a value's canonical serialization, as lowercase hex. Acquisition only: whoever acquires
// evidence digests it, and what judges evidence compares digests it is handed. Web Crypto, as Node and browsers in a
// secure context provide it.
export const digestOf = async value => {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
