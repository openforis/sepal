import {google} from 'googleapis'
import {defer, first, from} from 'rxjs'

import {serviceAccountCredentials} from '#gee/config'
import * as service from '#sepal/service'

// The scopes the Earth Engine client library asks for when it authenticates a service account.
const SCOPES = [
    'https://www.googleapis.com/auth/earthengine',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/devstorage.read_write'
]

const REFRESH_MARGIN_MS = 5 * 60 * 1000

// One service-account access token for the process, fetched again shortly before it expires.
export class ServiceAccountToken {
    #client
    #now
    #token = null
    #fetching = null

    constructor({client, now = Date.now}) {
        this.#client = client
        this.#now = now
    }

    token$() {
        return defer(() => from(this.#current()))
    }

    #current() {
        if (this.#token && this.#token.expiresAt - this.#now() > REFRESH_MARGIN_MS) {
            return Promise.resolve(this.#token)
        }
        this.#fetching ??= this.#fetch().finally(() => {
            this.#fetching = null
        })
        return this.#fetching
    }

    async #fetch() {
        const {access_token: accessToken, expiry_date: expiresAt} = await this.#client.authorize()
        this.#token = {accessToken, expiresAt}
        return this.#token
    }
}

const serviceAccountToken = new ServiceAccountToken({
    client: new google.auth.JWT({
        email: serviceAccountCredentials.client_email,
        key: serviceAccountCredentials.private_key,
        scopes: SCOPES
    })
})

export const serviceAccountTokenService = {
    serviceName: 'ServiceAccountToken',
    serviceHandler$: () => serviceAccountToken.token$()
}

export const serviceAccountToken$ = () =>
    service.submit$(serviceAccountTokenService).pipe(first())
