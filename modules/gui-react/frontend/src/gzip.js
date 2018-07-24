import pako from 'pako'
import {from} from 'rxjs'


export const gzip$ = (content, options = {}) =>
    from(new Promise((resolve, reject) => {
        try {
            return resolve(pako.deflate(JSON.stringify(content), options))
        } catch (exception) {
            return reject(exception)
        }
    }))