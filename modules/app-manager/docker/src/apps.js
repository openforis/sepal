const {EMPTY, from, interval, of} = require('rxjs')
const {catchError, delay, exhaustMap, filter, map, concatMap, switchMap} = require('rxjs/operators')
const log = require('sepal/log').getLogger('apps')
const {fileToJson$} = require('./file')
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
        map(({endpoint = 'shiny', repository, branch}) => {
            const name = basename(repository)
            return {
                endpoint,
                name,
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

const updateKernel$ = ({name, path}) => {
    const kernelPath = join('/usr/local/share/jupyter/kernels', `venv-${name}`)
    const venvPath = join(kernelPath, 'venv')
    return exists$({path: kernelPath}).pipe(
        switchMap(kernelExists => kernelExists ? of(true) : createKernel$({path: kernelPath})),
        switchMap(() => exists$(venvPath)),
        switchMap(venvExists => venvExists ? of(true) : createVenv$({path: venvPath})),
        switchMap(() => installRequirements$({venvPath, requirementsPath: join(path, 'requirements.txt')}))
    )
}

const createKernel$ = ({path}) => {
    const venvPath = join(path, 'venv')
    const kernel = {
        'argv': [join(venvPath, 'bin/python3'), '-m', 'ipykernel_launcher', '-f', '{connection_file}'],
        'language': 'python'
    }

    return exec$(
        '/',
        'sudo',
        ['mkdir', '-p', path]
    ).pipe(
        switchMap(() => exec$(
            '/',
            'sudo',
            ['chown', `${userInfo().username}:`, path]
        )),
        switchMap(() => from(writeFile(join(path, 'kernel.json'), JSON.stringify(kernel))))
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
            [join(path, 'bin/pip3'), 'install', '--cache-dir', '/root/.cache/pip', '--upgrade', 'pip']
        )),
        switchMap(() => exec$(
            '/',
            'sudo',
            [join(path, 'bin/pip3'), 'install', '--cache-dir', '/root/.cache/pip', 'ipykernel', 'wheel']
        ))
    )

const installRequirements$ = ({venvPath, requirementsPath}) =>
    exec$(
        '/',
        'sudo',
        [join(venvPath, 'bin/pip3'), 'install', '--cache-dir', '/root/.cache/pip', 'ipykernel', '-r', requirementsPath]
    )

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
            ['GIT_TERMINAL_PROMPT=0', 'git', 'clone', repository]
        ))
    )
}

module.exports = {monitorApps}
