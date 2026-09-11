import {subHours} from 'date-fns/subHours'
import {catchError, concatMap, defer, EMPTY, expand, filter, lastValueFrom, map, of, reduce, switchMap, tap} from 'rxjs'

import {getLogger} from '#sepal/log'

import {minHoursPublished} from './config.js'
import {getUpdates$} from './earthSearch.js'
import {formatInterval} from './time.js'

const log = getLogger('stac')

export const updateFromStac = args => lastValueFrom(updateFromStac$(args))

export const updateFromStac$ = ({source, dataset, query, sceneMapper, redis, database, timestamp}) => defer(() => {
    log.info('Updating database from Earth Search')
    const t0 = Date.now()
    return defer(() => redis.getLastUpdate(dataset)).pipe(
        switchMap(minTimestamp => {
            const maxTimestamp = subHours(new Date(), minHoursPublished).toISOString()
            const getPage$ = token => defer(() =>
                getUpdates$({source, dataset, query, sceneMapper, minTimestamp, maxTimestamp, token})
            )
            return getPage$().pipe(
                expand(({token}) => token ? getPage$(token) : EMPTY),
                filter(({scenes}) => scenes.length),
                concatMap(({scenes, mostRecentTimestamp}) =>
                    defer(() => database.insert({scenes, timestamp})).pipe(
                        map(() => mostRecentTimestamp)
                    )
                ),
                reduce(updateTimestamp, minTimestamp),
                concatMap(updatedTimestamp => defer(() => redis.setLastUpdate({[dataset]: updatedTimestamp}))),
                catchError(error => {
                    log.warn('Error during update', error)
                    return of(undefined)
                }),
                tap({complete: () => log.info(`Finished database update from Earth Search (${formatInterval(t0)})`)})
            )
        })
    )
})

const updateTimestamp = (timestamp, mostRecentTimestamp) =>
    !timestamp || mostRecentTimestamp > timestamp
        ? mostRecentTimestamp
        : timestamp
