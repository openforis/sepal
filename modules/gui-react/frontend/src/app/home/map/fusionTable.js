import Http from 'http-client'
import {map as rxMap} from 'rxjs/operators'
import {subscribe} from 'store'
import {fromGoogleBounds, google, map, polygonOptions} from './map'
import './map.module.css'

let googleTokens = null
subscribe('user.currentUser.googleTokens', (tokens) => googleTokens = tokens)

class FusionTable {
    static setLayer(contextId, {id, table, keyColumn, key, bounds}, onInitialized) {
        const layer = key
            ? new FusionTable({table, keyColumn, key, bounds})
            : null
        const changed = map.getLayers(contextId).set(id, layer)
        if (layer && changed && onInitialized)
            onInitialized(layer)

    }

    static get$(query, args = {}) {
        query = query.replace(/\s+/g, ' ').trim()
        return Http.get$(`https://www.googleapis.com/fusiontables/v2/query?sql=${query}&${authParam()}`, args)
    }

    static columns$(tableId, args) {
        return Http.get$(
            `https://www.googleapis.com/fusiontables/v2/tables/${tableId}/columns?${authParam()}`,
            args
        ).pipe(
            rxMap((e) => e.response.items)
        )
    }

    constructor({table, keyColumn, key, bounds}) {
        this.table = table
        this.keyColumn = keyColumn
        this.key = key
        this.bounds = bounds

        this.layer = new google.maps.FusionTablesLayer({
            suppressInfoWindows: true,
            query: {
                from: table,
                select: 'geometry',
                where: `'${keyColumn}' = '${key}'`
            },
            styles: [{polygonOptions: {...polygonOptions}}]
        })
    }

    equals(o) {
        return o === this || (
            o instanceof FusionTable &&
            o.table === this.table &&
            o.keyColumn === this.keyColumn &&
            o.key === this.key
        )
    }

    addToMap(map) {
        this.layer.setMap(map)
    }

    removeFromMap(map) {
        this.layer.setMap(null)
    }

    loadBounds$() {
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
        return FusionTable.get$(`
            SELECT geometry 
            FROM ${this.table} 
            WHERE '${this.keyColumn}' = '${this.key}'
        `).pipe(
            rxMap((e) => {
                    const googleBounds = new google.maps.LatLngBounds()
                    if (!e.response.rows[0])
                        throw new Error(`No ${this.keyColumn} = ${this.key} in ${this.table}`)
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

const authParam = () =>
    googleTokens
        ? `access_token=${googleTokens.accessToken}`
        : `key=${map.getKey()}`


export default FusionTable