import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {setApi} from '~/apiRegistry'

import {UserFilesMonitor} from './userFilesMonitor'

describe('UserFilesMonitor', () => {
    let ws

    beforeEach(() => {
        ws = fakeUserFilesWs()
        setApi({userFiles: {ws: () => ws}})
    })

    describe('remove failures', () => {
        it('reports the paths that could not be removed, not as a listing', () => {
            const onUpdate = vi.fn()
            const onRemoveFailed = vi.fn()
            subscribed(onUpdate, {onRemoveFailed})

            ws.update({removeFailed: ['data/a']})

            expect(onRemoveFailed).toHaveBeenCalledWith(['data/a'])
            expect(onUpdate).not.toHaveBeenCalled()
        })
    })

    describe('watch', () => {
        it('starts watching the requested folders once the module is ready', () => {
            const monitor = subscribed()

            monitor.watch(['', 'downloads'])
            ws.ready(true)

            expect(ws.sent).toEqual([{monitor: ['', 'downloads'], reset: true}])
        })

        it('starts and stops watching only the folders that changed', () => {
            const monitor = subscribed()
            ws.ready(true)
            monitor.watch(['', 'downloads'])

            monitor.watch(['', 'scripts'])

            expect(ws.sent.slice(-2)).toEqual([
                {unmonitor: ['downloads']},
                {monitor: ['scripts']}
            ])
        })

        it('sends nothing when the folders are unchanged', () => {
            const monitor = subscribed()
            ws.ready(true)
            monitor.watch(['', 'downloads'])
            const sent = ws.sent.length

            monitor.watch(['', 'downloads'])

            expect(ws.sent.length).toEqual(sent)
        })

        it('keeps watching a subfolder when its parent is no longer watched', () => {
            const monitor = subscribed()
            ws.ready(true)
            monitor.watch(['', 'a', 'a/b'])

            monitor.watch(['', 'a/b'])

            expect(ws.sent.slice(-2)).toEqual([
                {unmonitor: ['a']},
                {monitor: ['a/b']}
            ])
        })

        it('watches all requested folders again when the module becomes ready again', () => {
            const monitor = subscribed()
            ws.ready(true)
            monitor.watch(['', 'downloads'])

            ws.ready(false)
            monitor.watch(['', 'downloads', 'downloads/mosaic'])
            ws.ready(true)

            expect(ws.sent.at(-1)).toEqual({monitor: ['', 'downloads', 'downloads/mosaic'], reset: true})
        })
    })

    describe('updates', () => {
        it('reports the items of watched folders', () => {
            const onUpdate = vi.fn()
            const monitor = subscribed(onUpdate)
            ws.ready(true)
            monitor.watch([''])

            ws.update({path: '', items: {downloads: {dir: true}}})

            expect(onUpdate).toHaveBeenCalledWith({path: '', items: {downloads: {dir: true}}})
        })

        it('ignores folders that are no longer watched', () => {
            const onUpdate = vi.fn()
            const monitor = subscribed(onUpdate)
            ws.ready(true)
            monitor.watch(['', 'downloads'])
            monitor.watch([''])

            ws.update({path: 'downloads', items: {}})

            expect(onUpdate).not.toHaveBeenCalled()
        })
    })

    it('asks the module to remove paths', () => {
        const monitor = subscribed()
        ws.ready(true)

        monitor.remove(['downloads/old'])

        expect(ws.sent.at(-1)).toEqual({remove: ['downloads/old']})
    })

    it('drives the socket of the api it was given', () => {
        const dataWs = fakeUserFilesWs()
        const monitor = new UserFilesMonitor({api: () => ({ws: () => dataWs})})
        monitor.subscribe(() => {})

        monitor.watch(['data'])
        dataWs.ready(true)

        expect(dataWs.sent).toEqual([{monitor: ['data'], reset: true}])
        expect(ws.sent).toEqual([])
    })

    it('ignores a listing that reports an error instead of items', () => {
        const onUpdate = vi.fn()
        const monitor = subscribed(onUpdate)
        ws.ready(true)
        monitor.watch(['data/x'])

        ws.update({path: 'data/x', error: 'INVALID_PATH'})

        expect(onUpdate).not.toHaveBeenCalled()
    })

    const subscribed = (onUpdate = () => {}, options) => {
        const monitor = new UserFilesMonitor()
        monitor.subscribe(onUpdate, options)
        return monitor
    }
})

const fakeUserFilesWs = () => {
    const upstream$ = new Subject()
    const downstream$ = new Subject()
    const sent = []
    upstream$.subscribe(message => sent.push(message))
    return {
        upstream$,
        downstream$,
        sent,
        ready: ready => downstream$.next({ready}),
        update: data => downstream$.next({data})
    }
}
