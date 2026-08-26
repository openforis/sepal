import _ from 'lodash'
import moment from 'moment'
import {defer, EMPTY, first, interval, map, merge, NEVER, of, race, switchMap, tap} from 'rxjs'

import {table, td, th, tr} from './asciiTable.js'
import {format, highlight, print, println, prompt, readLine$} from './console.js'
import {fromNow} from './date.js'
import {createSession$, joinSession$, sandboxInfo$, terminateSession$} from './endpoint.js'

const PROGRESS_TIME = 5 * 1000
const CONFIRM_WHEN_LESS_THAN_HOURS = 10
const CLEAR_SCREEN = '\u001B[2J\u001B[3J\u001B[H'

const budget = (spending, budget) => {
    const percentage = Math.round(100 * spending / budget)
    const formattedBudget = budget.toLocaleString('en-US', {})
    return `${percentage}% of ${formattedBudget}`
}

const renderBudget = info => {
    println('Instance spending:'.padEnd(19) +
        format(`${budget(info.spending.monthlyInstanceSpending, info.spending.monthlyInstanceBudget)} USD`, 'PURPLE_INTENSE'))
    println('Storage spending:'.padEnd(19) +
        format(`${budget(info.spending.monthlyStorageSpending, info.spending.monthlyStorageBudget)} USD`, 'PURPLE_INTENSE'))
    println('Storage used:'.padEnd(19) +
        format(`${budget(info.spending.storageUsed, info.spending.storageQuota)} GB`, 'PURPLE_INTENSE'))
    println()
}

const timeSinceCreation = session => {
    return fromNow(session.creationTime)
}

const totalCost = session => {
    const hours = moment().diff(moment(session.creationTime), 'seconds') / 3600
    const cost = Math.max(0.01, hours * session.instanceType.hourlyCost)
    return cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

const renderInstanceTypesTable = info => {
    const header = [
        th([
            td({value: 'Available instance types', colSpan: 4, styles: ['BOLD', 'GREEN']})
        ]),
        th([
            td({value: 'Type', styles: ['BOLD']}),
            td({value: 'CPU', styles: ['BOLD'], align: 'right'}),
            td({value: 'GB RAM', styles: ['BOLD'], align: 'right'}),
            td({value: 'USD/h', styles: ['BOLD'], align: 'right'})
        ])
    ]
    const rows = info.instanceTypes
        .filter(({tag}) => tag)
        .map(type =>
            tr([
                td({value: type.tag, styles: ['YELLOW_INTENSE']}),
                td({value: type.cpuCount}),
                td({value: type.ramGiB}),
                td({value: type.hourlyCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}), align: 'right'})
            ])
        )
    println(table([...header, ...rows]))
}

const renderSessionsTable = info => {
    if (!info.sessions.length) {
        return
    }
    const header = [
        th([
            td({value: 'Active sessions', colSpan: 6, styles: ['BOLD', 'GREEN']})
        ]),
        th([
            td({value: 'ID', styles: ['BOLD'], align: 'right'}),
            // The name is what every other surface calls this instance; the ID stays because it is
            // what the user TYPES below (`1` to join, `1s` to stop).
            td({value: 'Name', styles: ['BOLD']}),
            td({value: 'Type', styles: ['BOLD']}),
            td({value: 'Time', styles: ['BOLD'], align: 'right'}),
            td({value: 'USD', styles: ['BOLD'], align: 'right'}),
            td({value: 'Apps', styles: ['BOLD']})
        ])
    ]
    // one line per app: the session's first row carries its details and first app,
    // each further app continues on its own row with the other cells left empty
    const rows = info.sessions.flatMap((session, i) => {
        const [firstApp, ...moreApps] = (session.apps || []).map(({path, label}) => label || path)
        return [
            tr([
                td({value: i + 1, styles: ['YELLOW_INTENSE']}),
                td({value: session.name ?? ''}),
                td({value: session.instanceType.tag}),
                td({value: timeSinceCreation(session), align: 'right'}),
                td({value: totalCost(session), align: 'right'}),
                td({value: firstApp ?? ''})
            ]),
            ...moreApps.map(app =>
                tr([
                    td({value: ''}),
                    td({value: ''}),
                    td({value: ''}),
                    td({value: ''}),
                    td({value: ''}),
                    td({value: app})
                ])
            )
        ]
    })
    println('')
    println(table([...header, ...rows]))
}

const renderTable = info => {
    renderInstanceTypesTable(info)
    renderSessionsTable(info)
}

const renderExample = info => {
    if (info.sessions.length) {
        println(`Enter ${highlight('Type')}, ${highlight('ID')}, or ${highlight('ID')}+${highlight('s')}.`)
        println()
        println('Examples:')
        println(`  ${highlight('t1')}    start a t1 instance`)
        println(`  ${highlight('1')}     join session #1`)
        println(`  ${highlight('1s')}    stop session #1`)
    } else {
        println(`Enter ${highlight('Type')} of instance to start.`)
        println()
        println('Example:')
        println(`  ${highlight('t1')}    start a t1 instance`)
    }
    println()
}

// preferred (e.g. the instance type whose launch just failed, offered for retry) wins
// when it is a real instance-type tag; otherwise fall back to the regular default.
const getDefaultSelection = (info, preferred) =>
    preferred && info.instanceTypes.find(({tag}) => tag === preferred)
        ? preferred
        : info.sessions.length
            ? '1'
            : info.instanceTypes.find(({tag}) => tag).tag

const renderSelection = (info, defaultSelection) => {
    return prompt(`Select (${highlight(getDefaultSelection(info, defaultSelection))}): `)
}

const getSelectedInstanceType = (info, selection) =>
    info.instanceTypes.find(({tag}) => tag === selection)

const stopSelected$ = (info, selection, sessionEvent$) => {
    const session = info.sessions[_.toNumber(selection.substring(0, selection.length - 1)) - 1]
    const apps = session.apps || []
    return apps.length
        ? confirmStop$(session, apps, sessionEvent$)
        : stop$(session, sessionEvent$)
}

// y/N confirmation listing the apps running on the instance. Mirrors confirmLaunch$:
// plain readLine$, deliberately NOT raced against sessionEvent$ (in-flight actions
// are never interrupted — see promptSelect$).
const confirmStop$ = (session, apps, sessionEvent$) => {
    println('')
    println(highlight('The following apps are running on this instance and will be closed:'))
    apps.forEach(({label, path}) => println(`    - ${label || path}`))
    print('\nAre you sure you want to stop it (y/N): ')
    return readLine$().pipe(
        switchMap(confirm =>
            confirm === 'y'
                ? stop$(session, sessionEvent$)
                : refresh$(sessionEvent$)
        )
    )
}

const stop$ = (session, sessionEvent$) => {
    print('\nStopping session. Please wait...')
    return merge(
        interval(PROGRESS_TIME).pipe(
            tap(() => print('.')),
            switchMap(() => EMPTY)
        ),
        terminateSession$(session).pipe(
            tap(() => println('\n')),
        )
    ).pipe(
        first(),
        switchMap(() => refresh$(sessionEvent$))
    )
}

// failureMessage — only two messages are exposed to the user:
//   INSTANCE_UNAVAILABLE (AWS capacity / type not offered in the availability zone) → the
//   type-specific message; every other launch failure (account quota, unclassified errors,
//   a session dying mid-start) → the generic trouble-starting message.
const failureMessage = (reason, tag) =>
    reason === 'INSTANCE_UNAVAILABLE'
        ? `This instance type${tag ? ` (${tag})` : ''} is currently unavailable from the cloud provider.`
        : 'The cloud provider is having trouble starting a new instance. Please try again.'

// unavailable$ — the launch/join could not complete: tell the user why (as far as the worker
// could classify it) and return to the menu, defaulting the prompt to the failed type so
// Enter retries and any tag picks another.
const unavailable$ = (sessionEvent$, reason, {tag, defaultSelection} = {}) =>
    defer(() => {
        print(CLEAR_SCREEN)
        return interactive$(sessionEvent$, {
            notice: format(failureMessage(reason, tag), 'RED_INTENSE'),
            defaultSelection
        })
    })

const orUnavailable$ = (session$, sessionEvent$, retry) =>
    session$.pipe(
        switchMap(session => session?.unavailable
            ? unavailable$(sessionEvent$, session.reason, retry)
            : of(session))
    )

const joinSelected$ = (info, selection, sessionEvent$) => {
    const session = info.sessions[_.toNumber(selection) - 1]
    if (session.status === 'STARTING') {
        print('\nSession is still starting up. This might start a new server, which could take several minutes.\nPlease wait...')
    } else {
        print('\nJoining running session. Please wait...')
    }
    const join$ = merge(
        interval(PROGRESS_TIME).pipe(
            tap(() => print('.')),
            switchMap(() => EMPTY)
        ),
        joinSession$(session).pipe(
            tap(() => println('\n')),
        )
    ).pipe(
        first()
    )
    return orUnavailable$(join$, sessionEvent$, {tag: session.instanceType.tag})
}

const launch$ = (instanceType, sessionEvent$) => {
    print('\nSession is starting. This might start a new server, which could take several minutes.\nPlease wait...')
    const create$ = merge(
        interval(PROGRESS_TIME).pipe(
            tap(() => print('.')),
            switchMap(() => EMPTY)
        ),
        createSession$(instanceType).pipe(
            tap(() => println('\n')),
        )
    ).pipe(
        first()
    )
    return orUnavailable$(create$, sessionEvent$, {tag: instanceType.tag, defaultSelection: instanceType.tag})
}

const confirmLaunch$ = (info, instanceType, sessionEvent$) => {
    print('\nAre you sure you want to continue (y/N): ')
    return readLine$().pipe(
        switchMap(confirm =>
            confirm === 'y'
                ? launch$(instanceType, sessionEvent$)
                : refresh$(sessionEvent$)
        )
    )
}

const startSelected$ = (info, selection, sessionEvent$) =>
    defer(() => {
        const selectedInstanceType = getSelectedInstanceType(info, selection)
        if (!selectedInstanceType) {
            println(`  Invalid option: ${selection}`)
            println()
            return promptSelect$(info, sessionEvent$)
        }
        const spendingLeft = info.spending.monthlyInstanceBudget - info.spending.monthlyInstanceSpending
        const hoursLeft = Math.floor(spendingLeft / selectedInstanceType.hourlyCost)
        if (hoursLeft <= 0) {
            println('\nYou don\'t have enough resources to run this session. Please consider\n' +
                'reducing the size of your selected instance, or contact a SEPAL administrator to increase\n' +
                'your resource limits.\n\n')
            return promptSelect$(info, sessionEvent$)
        }
        println(`\nYou can run this session for ${hoursLeft} hours. If you require more processing time, please consider\n` +
            'reducing the size of your selected instance, or contact a SEPAL administrator to increase\n' +
            'your resource limits.')
        if (hoursLeft <= CONFIRM_WHEN_LESS_THAN_HOURS)
            return confirmLaunch$(info, selectedInstanceType, sessionEvent$)
        else {
            return launch$(selectedInstanceType, sessionEvent$)
        }
    })

const isStart = (info, selection) =>
    !!info.instanceTypes.find(({tag}) => tag === selection)

const isJoin = (info, selection) =>
    /^\d+$/.test(selection) && info.sessions.find((session, i) => i + 1 === parseInt(selection))

const isStop = (info, selection) =>
    selection.length > 1 && selection.endsWith('s') && info.sessions.find((session, i) => i + 1 === parseInt(selection.substring(0, selection.length - 1)))

const select$ = (info, selection, sessionEvent$) =>
    defer(() => {
        if (isStart(info, selection)) {
            return startSelected$(info, selection, sessionEvent$)
        } else if (isJoin(info, selection)) {
            return joinSelected$(info, selection, sessionEvent$)
        } else if (isStop(info, selection)) {
            return stopSelected$(info, selection, sessionEvent$)
        } else {
            println(`  Invalid option: ${selection}`)
            println()
            return promptSelect$(info, sessionEvent$)
        }
    })

const refresh$ = sessionEvent$ =>
    defer(() => {
        print(CLEAR_SCREEN)
        return interactive$(sessionEvent$)
    })

// Race the prompt against the next session event: user input selects as before, an event
// (session started/stopped elsewhere) discards the pending prompt and re-renders the menu.
const promptSelect$ = (info, sessionEvent$, defaultSelection) =>
    defer(() => {
        renderSelection(info, defaultSelection)
        return race(
            readLine$().pipe(
                map(selection => ({selection: selection || getDefaultSelection(info, defaultSelection)}))
            ),
            sessionEvent$.pipe(
                first(),
                map(() => ({refresh: true}))
            )
        )
    }).pipe(
        switchMap(({refresh, selection}) =>
            refresh
                ? refresh$(sessionEvent$)
                : select$(info, selection, sessionEvent$)
        )
    )

// options.notice — one-off line (e.g. instance unavailable) shown between the tables and
// the examples; options.defaultSelection — one-off prompt default (e.g. retry the failed
// type). Neither survives an event-driven refresh: that re-enters without options.
const render$ = (info, sessionEvent$, {notice, defaultSelection} = {}) =>
    defer(() => {
        renderBudget(info)
        renderTable(info)
        if (notice) {
            println(notice)
            println()
        }
        renderExample(info)
        return promptSelect$(info, sessionEvent$, defaultSelection)
    })

const interactive$ = (sessionEvent$ = NEVER, options = {}) =>
    sandboxInfo$().pipe(
        switchMap(info => {
            if (info.exceededBudget) {
                println()
                renderBudget(info)
                return of()
            } else {
                return render$(info, sessionEvent$, options)
            }
        })
    )

export {failureMessage, interactive$}
