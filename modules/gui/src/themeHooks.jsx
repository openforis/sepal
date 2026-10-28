import {useSyncExternalStore} from 'react'

import {themeManager} from '~/theme'

const subscribeTo = observable$ => onChange => {
    const subscription = observable$.subscribe(onChange)
    return () => subscription.unsubscribe()
}

const subscribeToPreference = subscribeTo(themeManager.preference$)
const subscribeToTheme = subscribeTo(themeManager.theme$)

export const useThemePreference = () =>
    useSyncExternalStore(subscribeToPreference, () => themeManager.preference)

export const useTheme = () =>
    useSyncExternalStore(subscribeToTheme, () => themeManager.theme)

export const withThemePreference = () =>
    WrappedComponent => {
        const WithThemePreference = props =>
            <WrappedComponent {...props} themePreference={useThemePreference()}/>
        return WithThemePreference
    }

export const withTheme = () =>
    WrappedComponent => {
        const WithTheme = props =>
            <WrappedComponent {...props} theme={useTheme()}/>
        return WithTheme
    }
