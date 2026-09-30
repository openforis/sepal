import {THEME_PREFERENCES, themeManager} from '~/theme'
import {useThemePreference} from '~/themeHooks'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'

const ICONS = {dark: 'moon', light: 'sun', system: 'circle-half-stroke'}

export const ThemeSelector = () => {
    const themePreference = useThemePreference()
    return (
        <ButtonGroup>
            {THEME_PREFERENCES.map(preference =>
                <Button
                    key={preference}
                    look='highlight'
                    chromeless={preference !== themePreference}
                    disabled={preference === themePreference}
                    icon={ICONS[preference]}
                    tooltip={msg(preference === 'system' ? 'theme.systemTooltip' : `theme.${preference}`)}
                    onClick={() => themeManager.setPreference(preference)}
                />
            )}
        </ButtonGroup>
    )
}
