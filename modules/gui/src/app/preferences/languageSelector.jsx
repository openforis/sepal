import {getLanguage, languages, setLanguage} from '~/translate'
import {Buttons} from '~/widget/buttons'

export const LanguageSelector = () =>
    <Buttons
        shape='pill'
        selected={getLanguage()}
        options={languages.map(({code, name}) => ({value: code, label: code, tooltip: name}))}
        onChange={code => {
            setLanguage(code)
            window.location.reload()
        }}
    />
