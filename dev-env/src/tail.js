import {exec} from './exec.js'
import {getModules, isRunnable} from './utils.js'

const buildLogCommand = (module, {follow, recent, tail, since, until}) => {
    const flags = [
        follow ? '-f' : null,
        tail ? '-r 0' : null,
        recent ? `-r 20` : null,
        since ? `-s ${since}` : null,
        until ? `-u ${until}` : null
    ].filter(Boolean).join(' ')
    return `sepal logs ${module}${flags ? ' ' + flags : ''}`
}

export const tail = async (modules, options) => {
    const effective = (options.recent || options.tail || options.since || options.until)
        ? options
        : {...options, follow: true}

    const targets = getModules(modules).filter(isRunnable)

    if (targets.length === 0) {
        return
    }

    const args = [
        ...(options.merge ? ['--mergeall'] : []),
        ...targets.flatMap(module => [
            '-cT', 'ansi',
            '-l', buildLogCommand(module, effective)
        ])
    ]

    await exec({
        command: 'multitail',
        args,
        enableStdIn: true
    })
}
