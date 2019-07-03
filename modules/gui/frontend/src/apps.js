import {concat, exhaustMap, filter, first, map} from 'rxjs/operators'
import {interval} from 'rxjs'
import {select} from 'store'
import actionBuilder from 'action-builder'
import api from 'api'
import jupyterLabIcon from 'app/home/body/apps/logo/jupyter-lab.png'
import jupyterNotebookIcon from 'app/home/body/apps/logo/jupyter-notebook.png'
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
                endpoint: 'rstudio',
                single: true
            }
            const jupyterNotebook = {
                path: '/sandbox/jupyter/tree',
                image: jupyterNotebookIcon,
                alt: 'Jupyter Notebook',
                endpoint: 'jupyter',
                single: true,
                style: {
                    height: '90%',
                    width: '90%',
                    objectFit: 'contain'
                }
            }
            const jupyterLab = {
                path: '/sandbox/jupyter/lab',
                image: jupyterLabIcon,
                alt: 'Jupyter Lab',
                endpoint: 'jupyter',
                single: true,
                style: {
                    height: '90%',
                    width: '90%',
                    objectFit: 'contain'
                }
            }
            return actionBuilder('SET_APPS')
                .set('apps.list', [rStudio, jupyterNotebook, jupyterLab, ...apps])
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
