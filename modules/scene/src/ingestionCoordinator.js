import {subHours} from 'date-fns/subHours'
import {catchError, concatMap, defer, EMPTY, exhaustMap, forkJoin, from, ignoreElements, map, merge, of, reduce, tap, timer} from 'rxjs'

import {getLogger} from '#sepal/log'

const log = getLogger('ingestion')

const INITIAL_UPDATE_DELAY_SECONDS = 10

export class IngestionCoordinator {
    #ingestor
    #sources
    #clock
    #minHoursPublished
    #updateIntervalMinutes

    constructor({sceneIngestor, sources, clock, minHoursPublished, updateIntervalMinutes}) {
        this.#ingestor = sceneIngestor
        this.#sources = sources
        this.#clock = clock
        this.#minHoursPublished = minHoursPublished
        this.#updateIntervalMinutes = updateIntervalMinutes
    }

    // Emits readiness once; the subscription then owns the scheduler and its active update.
    start$() {
        return defer(() => this.#ingestor.isInitialized()).pipe(
            concatMap(initialized => {
                if (!initialized) return this.#initialize$()
                log.info('Skipped initialization from CSV files')
                return of(undefined)
            }),
            concatMap(() => defer(() => this.#ingestor.cleanup()).pipe(
                catchError(error => {
                    log.warn('Catalogue is initialized; disposable database cleanup will be retried at startup', error)
                    return of(undefined)
                })
            )),
            concatMap(() => merge(this.#scheduleUpdates$().pipe(ignoreElements()), of(undefined)))
        )
    }

    #initialize$() {
        return defer(() => {
            const timestamp = this.#clock()
            const maxTimestamp = subHours(timestamp, this.#minHoursPublished).toISOString()
            log.info(`Initializing database (timestamp: ${timestamp.toISOString()})`)
            return defer(() => this.#ingestor.prepare()).pipe(
                concatMap(() => this.#download$()),
                concatMap(() => from(this.#sources).pipe(
                    concatMap(source => source.load$({database: this.#ingestor, maxTimestamp, timestamp})),
                    reduce((checkpoints, updates) => Object.assign(checkpoints, updates), {})
                )),
                concatMap(checkpoints => defer(() => this.#ingestor.publish({checkpoints, timestamp}))),
                tap(() => log.info('Initialized database from CSV files'))
            )
        })
    }

    #download$() {
        if (!this.#sources.length) return of(undefined)
        // Wait for every download to settle before reporting failure, so a retry cannot overlap old writers.
        return forkJoin(this.#sources.map(source => source.download$().pipe(
            map(() => null),
            catchError(error => of({error}))
        ))).pipe(
            tap(results => {
                const failed = results.find(result => result)
                if (failed) throw failed.error
            })
        )
    }

    #scheduleUpdates$() {
        log.info(`Running updates every ${this.#updateIntervalMinutes} minutes`)
        return timer(INITIAL_UPDATE_DELAY_SECONDS * 1000, this.#updateIntervalMinutes * 60 * 1000).pipe(
            exhaustMap(() => this.#update$().pipe(
                catchError(error => {
                    log.error('Error during scheduled update:', error)
                    return EMPTY
                })
            ))
        )
    }

    #update$() {
        return defer(() => {
            const timestamp = this.#clock()
            return from(this.#sources).pipe(
                concatMap(source => source.update$({database: this.#ingestor, timestamp}))
            )
        })
    }
}
