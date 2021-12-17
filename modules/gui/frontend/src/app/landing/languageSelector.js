import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {getLanguage, setLanguage} from 'translate'
import React from 'react'

const LanguageSelector = () => {
    const languages = [
        {code: 'en', name: 'English'},
        {code: 'es', name: 'Español'},
        {code: 'fr', name: 'Français'}
    ]

    return (
        <ButtonGroup>
            {languages.map(({code, name}) =>
                <Language key={code} code={code} name={name} selected={code === getLanguage()}/>)}
        </ButtonGroup>
    )
}

export default LanguageSelector

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
