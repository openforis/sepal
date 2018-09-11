import {from} from 'rxjs'
import pako from 'pako'

export const gzip$ = (content, options = {}) =>
    from(new Promise((resolve, reject) => {
        try {
            return resolve(pako.deflate(JSON.stringify(content), options))
        } catch (exception) {
            return reject(exception)
        }
    }))

export const ungzip$ = (compressed, options = {}) =>
    from(new Promise((resolve, reject) => {
        try {
            return resolve(JSON.parse(pako.inflate(compressed, options)))
        } catch
        (exception) {
            return reject(exception)
        }
    }))
