import {THEME_PREFERENCES, themeManager} from '~/theme'
import {useThemePreference} from '~/themeHooks'
import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'

const ICONS = {dark: 'moon', light: 'sun', system: 'circle-half-stroke'}

export const ThemeSelector = () => {
    const themePreference = useThemePreference()
    return (
        <Buttons
            shape='pill'
            selected={themePreference}
            options={THEME_PREFERENCES.map(preference => ({
                value: preference,
                icon: ICONS[preference],
                tooltip: msg(preference === 'system' ? 'theme.systemTooltip' : `theme.${preference}`)
            }))}
            onChange={preference => themeManager.setPreference(preference)}
        />
    )
}
