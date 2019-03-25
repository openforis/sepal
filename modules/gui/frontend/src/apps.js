import {concat, exhaustMap, filter, first, map} from 'rxjs/operators'
import {interval} from 'rxjs'
import {select} from 'store'
import actionBuilder from 'action-builder'
import api from 'api'
import jupyterIcon from 'app/home/body/apps/logo/jupyter.png'
import rstudioIcon from 'app/home/body/apps/logo/r-studio.png'

export const appList = () =>
    select('apps.list') || []

export const loadApps$ = () =>
    api.apps.loadAll$().pipe(
        map(apps => {
            const rStudio = {
                path: '/sandbox/rstudio/',
                image: rstudioIcon,
                alt: 'RStudio',
                endpoint: 'rstudio'
            }
            const jupyter = {
                path: '/sandbox/jupyter/tree',
                image: jupyterIcon,
                alt: 'Jupyter notebook',
                endpoint: 'jupyter',
                style: {
                    height: '90%',
                    width: '90%',
                    objectFit: 'contain'
                }
            }
            return actionBuilder('SET_APPS')
                .set('apps.list', [rStudio, jupyter, ...apps])
                .dispatch()
        })
    )

export const runApp$ = path => {
    const {endpoint} = appList().find(app => app.path === path)

    const isSessionStarted = e => e.response.status === 'STARTED'

    const requestSession$ = api.apps.requestSession$(endpoint).pipe(
        filter(isSessionStarted)
    )

    const waitForSession$ = interval(1000).pipe(
        exhaustMap(() => api.apps.waitForSession$(endpoint)),
        filter(isSessionStarted),
        first()
    )

    return requestSession$.pipe(
        concat(waitForSession$),
        first()
    )
}
