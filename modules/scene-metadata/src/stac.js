const {formatInterval} = require('./time')
const {from, expand, EMPTY, finalize, switchMap, lastValueFrom, filter, reduce, map, exhaustMap, catchError} = require('rxjs')
const {getUpdates$} = require('./earthSearch')
const {subDays} = require('date-fns/subDays')
const {minDaysPublished} = require('./config')
const log = require('#sepal/log').getLogger('stac')

const updateTimestamp = (timestamp, mostRecentTimestamp) =>
    !timestamp || mostRecentTimestamp > timestamp
        ? mostRecentTimestamp
        : timestamp

const updateFromStac$ = ({source, sceneMapper, redis, database, timestamp}) => {
    log.info('Updating database from Earth Search')
    const t0 = Date.now()
    return from(redis.getLastUpdate(source)).pipe(
        map(lastUpdate => ({
            minTimestamp: lastUpdate,
            maxTimestamp: subDays(new Date(), minDaysPublished).toISOString()
        })),
        switchMap(({minTimestamp, maxTimestamp}) =>
            from(database.beginTransaction()).pipe(
                switchMap(() =>
                    getUpdates$({source, sceneMapper, minTimestamp, maxTimestamp}).pipe(
                        expand(({token}) => token ? getUpdates$({source, sceneMapper, minTimestamp, maxTimestamp, token}) : EMPTY),
                        filter(({scenes}) => scenes.length),
                        exhaustMap(({scenes, mostRecentTimestamp}) =>
                            from(database.insert({scenes, timestamp})).pipe(
                                map(() => mostRecentTimestamp)
                            )
                        ),
                        reduce((updatedTimestamp, mostRecentTimestamp) => updateTimestamp(updatedTimestamp, mostRecentTimestamp), minTimestamp),
                    )
                ),
                switchMap(updatedTimestamp => from(redis.setLastUpdate(source, updatedTimestamp))),
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

const updateFromStac = async ({source, sceneMapper, redis, database, timestamp}) =>
    lastValueFrom(updateFromStac$({source, sceneMapper, redis, database, timestamp}))

module.exports = {updateFromStac}
