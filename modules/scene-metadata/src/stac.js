const {subHours} = require('date-fns/subHours')
const {from, expand, EMPTY, finalize, switchMap, lastValueFrom, filter, reduce, map, concatMap, catchError} = require('rxjs')
const {formatInterval} = require('./time')
const {getUpdates$} = require('./earthSearch')
const {minHoursPublished} = require('./config')
const log = require('#sepal/log').getLogger('stac')

const updateTimestamp = (timestamp, mostRecentTimestamp) =>
    !timestamp || mostRecentTimestamp > timestamp
        ? mostRecentTimestamp
        : timestamp

const updateFromStac$ = ({source, dataSet, query, sceneMapper, redis, database, timestamp}) => {
    log.info('Updating database from Earth Search')
    const t0 = Date.now()
    return from(redis.getLastUpdate(dataSet)).pipe(
        map(lastUpdate => ({
            minTimestamp: lastUpdate,
            maxTimestamp: subHours(new Date(), minHoursPublished).toISOString()
        })),
        switchMap(({minTimestamp, maxTimestamp}) =>
            from(database.beginTransaction()).pipe(
                switchMap(() =>
                    getUpdates$({source, dataSet, query, sceneMapper, minTimestamp, maxTimestamp}).pipe(
                        expand(({token}) => token ? getUpdates$({source, dataSet, query, sceneMapper, minTimestamp, maxTimestamp, token}) : EMPTY),
                        filter(({scenes}) => scenes.length),
                        concatMap(({scenes, mostRecentTimestamp}) =>
                            from(database.insert({scenes, timestamp})).pipe(
                                map(() => mostRecentTimestamp)
                            )
                        ),
                        reduce((updatedTimestamp, mostRecentTimestamp) => updateTimestamp(updatedTimestamp, mostRecentTimestamp), minTimestamp),
                    )
                ),
                switchMap(updatedTimestamp => from(redis.setLastUpdate({[dataSet]: updatedTimestamp}))),
                switchMap(() => from(database.commitTransaction())),
                catchError(error => {
                    log.warn('Error during update, rolling back transaction', error)
                    return from(database.rollbackTransaction())
                }),
                finalize(() => log.info(`Updated database from Earth Search (${formatInterval(t0)})`))
            )
        )
    )
}

const updateFromStac = async ({source, dataSet, query, sceneMapper, redis, database, timestamp}) =>
    lastValueFrom(updateFromStac$({source, dataSet, query, sceneMapper, redis, database, timestamp}))

module.exports = {updateFromStac}
