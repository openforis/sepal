import {filter, interval, race, startWith, take, timer} from 'rxjs'

const POLL_INTERVAL_MS = 250
const TIMEOUT_MS = 60 * 1000

// Emits once the page written into an app's frame can be shown. Only a voila notebook is waited for: its page
// arrives before its frontend has started, and until the widget models are restored from the kernel and every
// widget output is rendered it is a blank sheet of "Loading widget..." placeholders. Any other page — JupyterLab,
// the notebook tree, voila's own error pages — is ready as soon as the browser has parsed it.
export const voilaReady$ = appWindow =>
    race(
        interval(POLL_INTERVAL_MS).pipe(
            startWith(0),
            filter(() => isReady(appWindow))
        ),
        timer(TIMEOUT_MS)
    ).pipe(
        take(1)
    )

const isReady = appWindow => {
    try {
        return isPageReady(appWindow)
    } catch (_error) {
        // An app that cannot be inspected is better shown than hidden for good.
        return true
    }
}

// Until parsing is done, a voila page can't be told apart from any other: its head scripts block the parser.
const isPageReady = ({document, jupyterapp}) =>
    document.readyState !== 'loading'
        && (!isVoilaNotebook(document) || isVoilaNotebookReady(document, jupyterapp))

const isVoilaNotebook = document =>
    document.getElementById('rendered_cells') !== null

const isVoilaNotebookReady = (document, app) =>
    !!app && isRestored(app.widgetManager) && !hasLoadingWidget(document)

const isRestored = widgetManager =>
    !widgetManager || widgetManager.restoredStatus

const hasLoadingWidget = document =>
    Array.from(document.querySelectorAll('.jp-OutputArea-output.lm-Panel'))
        .some(output => output.childElementCount === 0 && !output.matches('.jupyter-widgets, .lm-mod-hidden'))
