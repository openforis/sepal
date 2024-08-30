import {getLanguage, languages, setLanguage} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'

export const LanguageSelector = () => {
    return (
        <ButtonGroup>
            {languages.map(({code, name}) =>
                <Language key={code} code={code} name={name} selected={code === getLanguage()}/>)}
        </ButtonGroup>
    )
}

const Language = ({code, name, selected}) =>
    <Button
        look='highlight'
        chromeless={!selected}
        disabled={selected}
        label={code}
        tooltip={name}
        onClick={() => {
            setLanguage(code)
            window.location.reload()
        }}
    />
