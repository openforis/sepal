const {EMPTY, from, interval, of, zip, catchError, delay, exhaustMap, filter, map, concatMap, switchMap} = require('rxjs')
const log = require('sepal/log').getLogger('apps')
const {fileToJson$, lastModifiedDate$} = require('./file')
const {exec$} = require('./terminal')
const {access, writeFile} = require('fs/promises')
const {basename, dirname, join} = require('path')
const {userInfo} = require('os')

const monitorApps = () =>
    interval(5000).pipe(
        exhaustMap(() => apps$().pipe(
            concatMap(app => updateApp$(app).pipe(
                delay(5000)
            ))
        ))
    ).subscribe({
        error: error => log.fatal('Monitor exited:', error),
        complete: () => log.fatal('Monitor unexpectedly completed')
    })

const apps$ = () =>
    fileToJson$('/var/sepal/app-manager/apps.json').pipe(
        switchMap(({apps}) => from(apps)),
        filter(({repository}) => repository),
        map(({endpoint = 'shiny', label, repository, branch}) => {
            const name = basename(repository)
            return {
                endpoint,
                name,
                label,
                path: endpoint === 'jupyter'
                    ? `/var/sepal/app-manager/apps/${name}`
                    : `/shiny/${name}`,
                repository,
                branch
            }
        }),
        catchError(error => {
            log.error('Failed to list apps:', error)
            return EMPTY
        })
    )

const updateApp$ = app => {
    log.info('Updating app', app.path)
    return exists$(app).pipe(
        switchMap(cloned => cloned ? of(true) : clone$(app)),
        switchMap(() => checkout$(app)),
        switchMap(() => pull$(app)),
        switchMap(() => useCustomKernel$(app)),
        switchMap(useCustomKernel => useCustomKernel ? updateKernel$(app) : of(false)),
        catchError(error => {
            log.error('Failed to update app:', error)
            return EMPTY
        })
    )
}

const useCustomKernel$ = ({endpoint, path}) =>
    endpoint === 'jupyter'
        ? exists$({path: join(path, 'requirements.txt')})
        : of(false)

const updateKernel$ = ({name, path, label}) => {
    const kernelPath = join('/usr/local/share/jupyter/kernels', `venv-${name}`)
    const venvPath = join(kernelPath, 'venv')
    const requirementsPath = join(path, 'requirements.txt')
    return exists$({path: kernelPath}).pipe(
        switchMap(pathExists => pathExists ? of(true) : createKernelDir$({path: kernelPath})),
        switchMap(() => exists$({path: venvPath})),
        switchMap(hasVenv => hasVenv ? needVenvUpdate$({path: venvPath}) : of(true)),
        switchMap(() => createVenv$({path: venvPath})),
        switchMap(() => installRequirements$({venvPath, requirementsPath})),
        switchMap(() => createKernel$({path: kernelPath, label, name}))
    )
}


const createKernelDir$ = ({path}) => {
    return exec$(
        '/',
        'sudo',
        ['mkdir', '-p', path]
    )
}

const createKernel$ = ({path, label, name}) => {
    const venvPath = join(path, 'venv')
    const venvName = `venv-${name}`
    const displayName = ` (venv) ${label}`
    const python3 = join(venvPath, 'bin/python3')

    return exec$(
        '/',
        'sudo',
        [python3, '-m', 'ipykernel', 'install', '--name', venvName, '--display-name', displayName]
    )
}

const createVenv$ = ({path}) =>
    exec$(
        '/',
        'sudo',
        ['python3', '-m', 'venv', path]
    ).pipe(
        switchMap(() => exec$(
            '/',
            'sudo',
            [join(path, 'bin/python3'), '-m', 'pip', 'install', '--cache-dir', '/root/.cache/pip', 'ipykernel', 'wheel']
        )),
        switchMap(() => exec$(
            '/',
            'sudo',
            [join(path, 'bin/python3'), '-m', 'pip', 'install', '--cache-dir', '/root/.cache/pip', '--upgrade', 'pip']
        )),
        switchMap(() => exec$(
            '/',
            'sudo',
            [join(path, 'bin/python3'), '-m', 'pip', 'install', '--cache-dir', '/root/.cache/pip', '--upgrade', 'ipykernel']
        ))
    )

const needVenvUpdate$ = ({venvPath, requirementsPath}) => {
    // If $venvPath/.installed exists, compare modified timestamp. 
    // If requirements are newer, remove all files and install, otherwise, do nothing
    return zip(
        lastModifiedDate$(requirementsPath),
        lastModifiedDate$(join(venvPath, '..', '.installed'))
    ).pipe(
        switchMap(([requirementsTime, installTime]) => {
            if (installTime < requirementsTime) {
                log.info(`${requirementsPath} modified since last installation. ${installTime} >= ${requirementsTime}`)
                return exec$(
                    path,
                    'sudo',
                    ['rm', '-rf', venvPath]
                )
            } else {
                log.info(`${requirementsPath} not modified since last installation. ${installTime} < ${requirementsTime}`)
                return EMPTY
            }
        })
    )
}

const installRequirements$ = ({venvPath, requirementsPath}) => {
    log.info('Installing requirements', {venvPath, requirementsPath})
    return exec$(
        '/',
        'sudo',
        ['install-requirements', venvPath, requirementsPath]
    )
}

const exists$ = ({path}) =>
    from(access(path)).pipe(
        map(() => true),
        catchError(() => of(false))
    )

const checkout$ = ({path, branch}) => {
    return branch
        ? onBranch$({path, branch}).pipe(
            switchMap(onBranch =>
                onBranch
                    ? of(true)
                    : exec$(
                        path,
                        'sudo',
                        ['GIT_TERMINAL_PROMPT=0', 'git', 'checkout', '-t', `origin/${branch}`]
                    )),
            catchError(() => {
                log.warn(`Failed to checkout branch ${branch}: ${path}`)
                return of(false)
            })
        )
        : of(true)
}

const onBranch$ = ({path, branch}) =>
    exec$(
        path,
        'sudo',
        ['GIT_TERMINAL_PROMPT=0', 'git', 'rev-parse', '--abbrev-ref', 'HEAD']
    ).pipe(
        map(currentBranch => currentBranch.trim() === branch)
    )

const pull$ = ({path}) => {
    return exec$(
        path,
        'sudo',
        ['GIT_TERMINAL_PROMPT=0', 'git', 'pull', '--recurse-submodules']
    )
}

const clone$ = ({path, repository}) => {
    return exec$(
        '/',
        'sudo',
        ['mkdir', '-p', dirname(path)]
    ).pipe(
        switchMap(() => exec$(
            dirname(path),
            'sudo',
            ['GIT_TERMINAL_PROMPT=0', 'git', 'clone', '--recurse-submodules', repository]
        ))
    )
}

module.exports = {monitorApps}
