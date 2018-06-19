import Http from 'http-client'
import {of} from 'rxjs'
import {map} from 'rxjs/operators'
import {subscribe} from 'store'
import {fromGoogleBounds, google, polygonOptions, sepalMap} from './map'
import './map.module.css'

let googleTokens = null
subscribe('user.currentUser.googleTokens', (tokens) => googleTokens = tokens)

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
    const changed = sepalMap.getContext(contextId).setLayer({id, layer, destroy$, onInitialized})
    return layer
}

export const queryFusionTable$ = (query, args = {}) => {
    query = query.replace(/\s+/g, ' ').trim()
    return Http.post$(`https://www.googleapis.com/fusiontables/v2/query?sql=${query}&${authParam()}`, args)
}

export const loadFusionTableColumns$ = (tableId, args) => {
    return Http.get$(
        `https://www.googleapis.com/fusiontables/v2/tables/${tableId}/columns?${authParam()}`,
        args
    ).pipe(
        map((e) => e.response.items)
    )
}

const authParam = () =>
    googleTokens
        ? `access_token=${googleTokens.accessToken}`
        : `key=${sepalMap.getKey()}`


class FusionTableLayer {
    constructor({tableId, keyColumn, key, bounds, fill}) {
        this.tableId = tableId
        this.keyColumn = keyColumn
        this.key = key
        this.bounds = bounds
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
        console.log('add to map', this)
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
                o.forEach((o) => callback(new google.maps.LatLng(o[1], o[0])))
            else {
                const property = ['geometries', 'geometry', 'coordinates'].find((p) => p in o)
                let value = property && o[property]
                if (!Array.isArray(value))
                    value = [value]
                value.forEach((o) => eachLatLng(o, callback))
            }
        }
        return queryFusionTable$(`
            SELECT geometry 
            FROM ${this.tableId} 
            WHERE '${this.keyColumn}' = '${this.key}'
        `).pipe(
            map((e) => {
                    const googleBounds = new google.maps.LatLngBounds()
                    if (!e.response.rows[0])
                        throw new Error(`No ${this.keyColumn} = ${this.key} in ${this.tableId}`)
                    try {
                        e.response.rows[0].forEach((o) =>
                            eachLatLng(o, (latLng) => googleBounds.extend(latLng))
                        )
                        this.bounds = fromGoogleBounds(googleBounds)
                        return this.bounds
                    } catch (e) {
                        console.error('Failed to get bounds', e)
                        throw e
                    }
                }
            )
        )
    }
}