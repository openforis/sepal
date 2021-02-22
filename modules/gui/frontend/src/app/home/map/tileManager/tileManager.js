import {ReplaySubject, Subject} from 'rxjs'
import {finalize, first, tap} from 'rxjs/operators'
import {getLogger} from 'log'
import {getTileManagerGroup} from './tileManagerGroup'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const log = getLogger('tileManager')

const stats = {
    in: 0,
    out: 0
}

export const getTileManager = tileProvider => {
    const {getTileProviderInfo, addTileProvider, removeTileProvider, submit, cancel, hidden} = getTileManagerGroup(tileProvider)

    const tileProviderId = uuid()

    addTileProvider(tileProviderId, tileProvider)

    const getType = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getType()
    }

    const getConcurrency = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getConcurrency()
    }

    const loadTile$ = request => {
        stats.in++
        const response$ = new ReplaySubject()
        const cancel$ = new Subject()
        submit({tileProviderId, requestId: request.id, request, response$, cancel$})
        return response$.pipe(
            first(),
            tap(() => stats.out++),
            finalize(() => {
                cancel$.next()
                log.trace(`Stats: in: ${stats.in}, out: ${stats.out}`)
            })
        )
    }

    const releaseTile = requestId => {
        cancel(requestId)
    }

    const hide = isHidden => {
        hidden(tileProviderId, isHidden)
    }

    const close = () => {
        removeTileProvider(tileProviderId)
    }

    return {
        getType,
        getConcurrency,
        loadTile$,
        releaseTile,
        hide,
        close
    }
}
