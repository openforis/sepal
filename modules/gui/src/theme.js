import {BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, of, shareReplay} from 'rxjs'

export const THEME_PREFERENCES = ['dark', 'light', 'system']

const STORAGE_KEY = 'sepal:theme'
const DEFAULT_PREFERENCE = 'dark'
const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'

export class ThemeManager {
    #storage
    #root
    #preference$
    #theme$

    constructor({storage, mediaQuery, root, events} = defaultEnvironment()) {
        this.#storage = storage
        this.#root = root
        this.#preference$ = new BehaviorSubject(this.#readPreference())
        this.#theme$ = combineLatest([this.#preference$, systemTheme$(mediaQuery)]).pipe(
            map(([preference, systemTheme]) => preference === 'system' ? systemTheme : preference),
            distinctUntilChanged(),
            shareReplay({bufferSize: 1, refCount: false})
        )
        events?.addEventListener('storage', ({key}) => {
            if (key === STORAGE_KEY) {
                this.#preference$.next(this.#readPreference())
            }
        })
    }

    get preference() {
        return this.#preference$.getValue()
    }

    get preference$() {
        return this.#preference$.asObservable()
    }

    get theme() {
        let theme
        this.#theme$.subscribe(current => theme = current).unsubscribe()
        return theme
    }

    get theme$() {
        return this.#theme$
    }

    setPreference(preference) {
        if (THEME_PREFERENCES.includes(preference)) {
            try {
                this.#storage?.setItem(STORAGE_KEY, preference)
            } catch (_error) {
                // Storage is unavailable (private mode, blocked site data): the choice lasts for this session.
            }
            this.#preference$.next(preference)
        }
    }

    apply() {
        let applied = false
        return this.#theme$.subscribe(theme => {
            if (applied) {
                suppressTransitions(this.#root)
            }
            this.#root.dataset.theme = theme
            applied = true
        })
    }

    #readPreference() {
        try {
            const stored = this.#storage?.getItem(STORAGE_KEY)
            return THEME_PREFERENCES.includes(stored) ? stored : DEFAULT_PREFERENCE
        } catch (_error) {
            return DEFAULT_PREFERENCE
        }
    }
}

const defaultEnvironment = () => ({
    storage: safeLocalStorage(),
    mediaQuery: globalThis.matchMedia?.(LIGHT_SCHEME_QUERY),
    root: globalThis.document?.documentElement,
    events: globalThis.window
})

const safeLocalStorage = () => {
    try {
        return globalThis.localStorage
    } catch (_error) {
        return null
    }
}

const systemTheme$ = mediaQuery =>
    mediaQuery
        ? new Observable(subscriber => {
            const onChange = ({matches}) => subscriber.next(schemeTheme(matches))
            subscriber.next(schemeTheme(mediaQuery.matches))
            mediaQuery.addEventListener('change', onChange)
            return () => mediaQuery.removeEventListener('change', onChange)
        })
        : of('dark')

const schemeTheme = prefersLight =>
    prefersLight ? 'light' : 'dark'

// Without this, every element with a transition animates to its new colors on its own schedule.
const suppressTransitions = root => {
    root.classList.add('themeSwitching')
    const requestFrame = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0))
    requestFrame(() => requestFrame(() => root.classList.remove('themeSwitching')))
}

export const themeManager = new ThemeManager()
