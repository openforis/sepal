import _ from 'lodash'
import {getLogger} from '#sepal/log'
const log = getLogger('asset')
import {get$, delete$, postJson$} from '#sepal/httpClient'

import {map} from 'rxjs'
import {userTag} from './tag.js'

const GEE_ENDPOINT = 'http://gee'
const LIST_ASSETS_URL = `${GEE_ENDPOINT}/asset/descendants`
const DELETE_ASSET_URL = `${GEE_ENDPOINT}/asset/delete`
const CREATE_FOLDER_URL = `${GEE_ENDPOINT}/asset/createFolder`

const getAsset$ = (user, id = '') => {
    log.trace(`${userTag(user.username)} loading:`, id || 'roots')
    return get$(LIST_ASSETS_URL, {
        query: {id},
        headers: {
            'sepal-user': getSepalUserHeader(user)
        },
        retry: {
            maxRetries: 0
        }
    }).pipe(
        map(({body}) => JSON.parse(body))
    )
}

const deleteAsset$ = (user, id) =>
    delete$(DELETE_ASSET_URL, {
        query: {id},
        headers: {
            'sepal-user': getSepalUserHeader(user)
        },
        retry: {
            maxRetries: 0
        }
    }).pipe(
        // map(({body}) => JSON.parse(body))
    )

const createFolder$ = (user, id) =>
    postJson$(CREATE_FOLDER_URL, {
        body: {id},
        headers: {
            'sepal-user': getSepalUserHeader(user)
        },
        retry: {
            maxRetries: 0
        }
    })

const getSepalUserHeader = user =>
    serialize(_.pick(user, ['id', 'username', 'googleTokens', 'status', 'roles', 'systemUser', 'admin']))
            
const serialize = value => {
    try {
        return value === null || value === undefined
            ? null
            : JSON.stringify(value)
    } catch (_error) {
        log.warn('Cannot serialize value:', value)
        return null
    }
}
    
export {getAsset$, deleteAsset$, createFolder$}
