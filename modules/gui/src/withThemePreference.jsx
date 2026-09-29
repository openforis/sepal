import {useSyncExternalStore} from 'react'

import {themeManager} from '~/theme'

const subscribe = onChange => {
    const subscription = themeManager.preference$.subscribe(onChange)
    return () => subscription.unsubscribe()
}

export const useThemePreference = () =>
    useSyncExternalStore(subscribe, () => themeManager.preference)

export const withThemePreference = () =>
    WrappedComponent => {
        const WithThemePreference = props =>
            <WrappedComponent {...props} themePreference={useThemePreference()}/>
        return WithThemePreference
    }
