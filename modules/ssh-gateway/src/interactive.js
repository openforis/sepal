const {EMPTY, defer, first, interval, map, merge, of, switchMap, tap} = require('rxjs')
const {sandboxInfo$, createSession$, joinSession$, terminateSession$} = require('./endpoint')
const {table, th, tr, td} = require('./asciiTable')
const {format, highlight, print, println, readLine$} = require('./console')
const {fromNow} = require('./date')
const moment = require('moment')
const _ = require('lodash')

const PROGRESS_TIME = 5 * 1000
const CONFIRM_WHEN_LESS_THAN_HOURS = 10

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

const renderTable = info => {
    const typeHeader = [
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
    const instanceTypesRows = info.instanceTypes
        .filter(({tag}) => tag)
        .map(type =>
            tr([
                td({value: type.tag, styles: ['YELLOW_INTENSE']}),
                td({value: type.cpuCount}),
                td({value: type.ramGiB}),
                td({value: type.hourlyCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}), align: 'right'})
            ])
        )
    const sessionsHeader = info.sessions.length
        ? [
            th([
                td({value: 'Active sessions', colSpan: 4, styles: ['BOLD', 'GREEN']})
            ]),
            th([
                td({value: 'ID', styles: ['BOLD'], align: 'right'}),
                td({value: 'Type', styles: ['BOLD']}),
                td({value: 'Time', styles: ['BOLD'], align: 'right'}),
                td({value: 'USD', styles: ['BOLD'], align: 'right'})
            ])
        ]
        : []
    const sessionRows = info.sessions.map((session, i) =>
        tr([
            td({value: i + 1, styles: ['YELLOW_INTENSE']}),
            td({value: session.instanceType.tag}),
            td({value: timeSinceCreation(session), align: 'right'}),
            td({value: totalCost(session), align: 'right'})
        ])
    )
    return println(
        table([
            ...typeHeader,
            ...instanceTypesRows,
            ...sessionsHeader,
            ...sessionRows
        ])
    )
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

const getDefaultSelection = info =>
    info.sessions.length
        ? '1'
        : info.instanceTypes.find(({tag}) => tag).tag

const renderSelection = info => {
    return print(`Select (${highlight(getDefaultSelection(info))}): `)
}

const getSelectedInstanceType = (info, selection) =>
    info.instanceTypes.find(({tag}) => tag === selection)

const stopSelected$ = (info, selection) => {
    const session = info.sessions[_.toNumber(selection.substring(0, selection.length - 1)) - 1]
    print('\nStopping session. Please wait...')

    return merge(
        interval(PROGRESS_TIME).pipe(
            tap(() => print('.')),
        ),
        terminateSession$(session).pipe(
            tap(() => println('\n')),
        )
    ).pipe(
        first(),
        switchMap(() => interactive$())
    )
}

const joinSelected$ = (info, selection) => {
    const session = info.sessions[_.toNumber(selection) - 1]
    if (session.status === 'STARTING') {
        print('\nSession is still starting up. This might start a new server, which could take several minutes.\nPlease wait...')
    } else {
        print('\nJoining running session. Please wait...')
    }
    return merge(
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
}

const launch$ = instanceType => {
    print('\nSession is starting. This might start a new server, which could take several minutes.\nPlease wait...')
    return merge(
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
}

const confirmLaunch$ = (info, instanceType) => {
    print('\nAre you sure you want to continue (y/N): ')
    return readLine$().pipe(
        switchMap(confirm =>
            confirm === 'y'
                ? launch$(instanceType)
                : interactive$()
        )
    )
}

const startSelected$ = (info, selection) =>
    defer(() => {
        const selectedInstanceType = getSelectedInstanceType(info, selection)
        if (!selectedInstanceType) {
            println(`  Invalid option: ${selection}`)
            println()
            return prompt$(info)
        }
        const spendingLeft = info.spending.monthlyInstanceBudget - info.spending.monthlyInstanceSpending
        const hoursLeft = Math.floor(spendingLeft / selectedInstanceType.hourlyCost)
        if (hoursLeft <= 0) {
            println('\nYou don\'t have enough resources to run this session. Please consider\n' +
                'reducing the size of your selected instance, or contact a SEPAL administrator to increase\n' +
                'your resource limits.\n\n')
            return prompt$(info)
        }
        println(`\nYou can run this session for ${hoursLeft} hours. If you require more processing time, please consider\n` +
            'reducing the size of your selected instance, or contact a SEPAL administrator to increase\n' +
            'your resource limits.')
        if (hoursLeft <= CONFIRM_WHEN_LESS_THAN_HOURS)
            return confirmLaunch$(info, selectedInstanceType)
        else {
            return launch$(selectedInstanceType)
        }
    })

const isStart = (info, selection) =>
    !!info.instanceTypes.find(({tag}) => tag === selection)

const isJoin = (info, selection) =>
    /^\d+$/.test(selection) && info.sessions.find((session, i) => i + 1 === parseInt(selection))

const isStop = (info, selection) =>
    selection.length > 1 && selection.endsWith('s') && info.sessions.find((session, i) => i + 1 === parseInt(selection.substring(0, selection.length - 1)))

const select$ = (info, selection) =>
    defer(() => {
        if (isStart(info, selection)) {
            return startSelected$(info, selection)
        } else if (isJoin(info, selection)) {
            return joinSelected$(info, selection)
        } else if (isStop(info, selection)) {
            return stopSelected$(info, selection)
        } else {
            println(`  Invalid option: ${selection}`)
            println()
            return prompt$(info)
        }
    })

const prompt$ = info =>
    defer(() => {
        renderSelection(info)
        return readLine$()
    })

const render$ = info =>
    defer(() => {
        renderBudget(info)
        renderTable(info)
        renderExample(info)
        return prompt$(info)
    }).pipe(
        map(selection => selection || getDefaultSelection(info)),
        switchMap(selection => select$(info, selection))
    )

const interactive$ = () =>
    sandboxInfo$().pipe(
        switchMap(info => {
            if (info.exceededBudget) {
                println()
                renderBudget(info)
                return of()
            } else {
                return render$(info)
            }
        })
    )

module.exports = {interactive$}
