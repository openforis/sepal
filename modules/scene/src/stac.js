import {subHours} from 'date-fns/subHours'
import {catchError, concatMap, defer, EMPTY, expand, filter, ignoreElements, lastValueFrom, switchMap, tap} from 'rxjs'

import {getLogger} from '#sepal/log'

import {minHoursPublished} from './config.js'
import {getUpdates$} from './earthSearch.js'
import {formatInterval} from './time.js'

const log = getLogger('stac')

export const updateFromStac = args => lastValueFrom(updateFromStac$(args), {defaultValue: undefined})

// Pages arrive in acquisition order, so each one commits with a checkpoint at its most recent scene.
export const updateFromStac$ = ({source, dataset, query, sceneMapper, database, timestamp}) => defer(() => {
    log.info('Updating database from Earth Search')
    const t0 = Date.now()
    return defer(() => database.getCheckpoint(dataset)).pipe(
        switchMap(minTimestamp => {
            const maxTimestamp = subHours(new Date(), minHoursPublished).toISOString()
            const getPage$ = token => defer(() =>
                getUpdates$({source, dataset, query, sceneMapper, minTimestamp, maxTimestamp, token})
            )
            return getPage$().pipe(
                expand(({token}) => token ? getPage$(token) : EMPTY),
                filter(({scenes}) => scenes.length),
                concatMap(({scenes, mostRecentTimestamp}) =>
                    defer(() => database.insert({scenes, timestamp, checkpoints: {[dataset]: mostRecentTimestamp}}))
                ),
                ignoreElements(),
                catchError(error => {
                    log.warn('Error during update', error)
                    return EMPTY
                }),
                tap({complete: () => log.info(`Finished database update from Earth Search (${formatInterval(t0)})`)})
            )
        })
    )
})
