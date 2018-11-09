import './map.module.css'
import {fromGoogleBounds, google, polygonOptions, sepalMap} from './map'
import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import {subscribe} from 'store'
import Http from 'http-client'

let googleTokens = null
subscribe('user.currentUser.googleTokens', tokens => googleTokens = tokens)

export const setFusionTableLayer = (
    {
        contextId,
        layerSpec: {id, tableId, keyColumn, key},
        bounds,
        fill,
        destroy$,
        onInitialized
    }) => {
    const layer = key
        ? new FusionTableLayer({tableId, keyColumn, key, bounds, fill})
        : null
    sepalMap.getContext(contextId).setLayer({id, layer, destroy$, onInitialized})
    return layer
}

export const queryFusionTable$ = (query, args = {}) => {
    query = query.replace(/\s+/g, ' ').trim()
    return Http.post$('https://www.googleapis.com/fusiontables/v2/query', {
        ...args,
        query: {sql: query, ...authParam()}
    })
}

export const loadFusionTableColumns$ = (tableId, {includedTypes, excludedTypes}) => {
    return Http.get$(
        `https://www.googleapis.com/fusiontables/v2/tables/${tableId}/columns`, {
            validStatuses: [200, 401, 404],
            query: {...authParam()}
        }
    ).pipe(
        map(({response}) => {
            if (response.error) {
                return {
                    columns: [],
                    error: {
                        key: errorKey(response.error),
                        code: response.error.code
                    }
                }
            } else
                return {
                    columns: response.items.filter(({type}) =>
                        (!includedTypes || includedTypes.includes(type)) &&
                        (!excludedTypes || !excludedTypes.includes(type))
                    )
                }
        })
    )
}

const errorKey = error => {
    switch(error.code) {
    case 401: return 'fusionTable.unauthorized'
    case 404: return 'fusionTable.notFound'
    default: return 'fusionTable.failedToLoad'
    }
}

const authParam = () =>
    googleTokens
        ? {access_token: googleTokens.accessToken}
        : {key: sepalMap.getKey()}

class FusionTableLayer {
    constructor({tableId, keyColumn, key, fill}) {
        this.tableId = tableId
        this.keyColumn = keyColumn
        this.key = key
        this.fill = fill

        this.layer = new google.maps.FusionTablesLayer({
            suppressInfoWindows: true,
            query: {
                from: tableId,
                select: 'geometry',
                where: `'${keyColumn}' = '${key}'`
            },
            styles: [{polygonOptions: {...polygonOptions(fill)}}]
        })
    }

    equals(o) {
        return o === this || (
            o instanceof FusionTableLayer &&
            o.tableId === this.tableId &&
            o.keyColumn === this.keyColumn &&
            o.key === this.key &&
            o.fill === this.fill
        )
    }

    addToMap(googleMap) {
        this.layer.setMap(googleMap)
    }

    removeFromMap() {
        this.layer.setMap(null)
    }

    initialize$() {
        if (this.bounds)
            return of(this)
        const eachLatLng = (o, callback) => {
            if (Array.isArray(o))
                o.forEach(o => callback(new google.maps.LatLng(o[1], o[0])))
            else {
                const property = ['geometries', 'geometry', 'coordinates'].find(p => p in o)
                let value = property && o[property]
                if (!Array.isArray(value))
                    value = [value]
                value.forEach(o => eachLatLng(o, callback))
            }
        }
        return queryFusionTable$(`
            SELECT geometry 
            FROM ${this.tableId} 
            WHERE '${this.keyColumn}' = '${this.key}'
        `).pipe(
            map(e => {
                const googleBounds = new google.maps.LatLngBounds()
                if (!e.response.rows[0])
                    throw new Error(`No ${this.keyColumn} = ${this.key} in ${this.tableId}`)
                try {
                    e.response.rows[0].forEach(o =>
                        eachLatLng(o, latLng => googleBounds.extend(latLng))
                    )
                    this.bounds = fromGoogleBounds(googleBounds)
                    return this.bounds
                } catch (e) {
                    // console.error('Failed to get bounds', e)
                    throw e
                }
            }
            )
        )
    }
}
