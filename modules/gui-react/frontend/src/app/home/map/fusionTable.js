import Http from 'http-client'
import {subscribe} from 'store'
import {google, map, polygonOptions} from './map'
import './map.module.css'

let googleTokens = null
subscribe('user.currentUser.googleTokens', (tokens) => googleTokens = tokens)

class FusionTable {
    static setLayer({id, table, keyColumn, key}, initialize) {
        const layer = key
            ? new FusionTable({table, keyColumn, key})
            : null
        const changed = map.setLayer({id, layer, fitBounds: false})
        if (layer && changed)
            initialize(layer)
    }

    static get$(query, args = {}) {
        query = query.replace(/\s+/g, ' ').trim()
        return Http.get$(`https://www.googleapis.com/fusiontables/v2/query?sql=${query}&${authParam()}`, args)
    }

    static columns$(tableId, args) {
        return Http.get$(`https://www.googleapis.com/fusiontables/v2/tables/${tableId}/columns?${authParam()}`, args)
            .map((e) => e.response.items)
    }

    constructor({table, keyColumn, key}) {
        this.table = table
        this.keyColumn = keyColumn
        this.key = key

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

    setMap(map) {
        this.layer.setMap(map)
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
            `).map((e) => {
                const bounds = new google.maps.LatLngBounds()
                if (!e.response.rows[0])
                    throw new Error(`No ${this.keyColumn} = ${this.key} in ${this.table}`)
                try {
                    e.response.rows[0].forEach((o) =>
                        eachLatLng(o, (latLng) => bounds.extend(latLng))
                    )
                    this.bounds = bounds
                    const ne = bounds.getNorthEast()
                    const sw = bounds.getSouthWest()
                    return [
                        [ne.lat(), ne.lng()],
                        [sw.lat(), sw.lng()],
                    ]
                } catch (e) {
                    console.error('Failed to get bounds', e)
                    throw e
                }
            }
        )
    }
}

const authParam = () =>
    googleTokens
        ? `access_token=${googleTokens.accessToken}`
        : `key=${map.getKey()}`


export default FusionTable