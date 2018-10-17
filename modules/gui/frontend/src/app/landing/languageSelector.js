import {getLanguage, setLanguage} from 'translate'
import React from 'react'
import Tooltip from 'widget/tooltip'
import styles from './languageSelector.module.css'

const LanguageSelector = () => {
    const languages = [
        {code: 'en', name: 'English'},
        {code: 'es', name: 'Español'},
        {code: 'fr', name: 'Français'}
    ]

    return <div className={styles.languages}>
        {
            languages.map(({code, name}) =>
                <Language key={code} code={code} name={name} selected={code === getLanguage()}/>
            )
        }
    </div>
}

export default LanguageSelector

const Language = ({code, name, selected}) =>
    <Tooltip msg={name}>
        {selected
            ? <span><span>{code}</span></span>
            : <span><a
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                    setLanguage(code)
                    window.location = window.location
                }}>
                {code}
            </a></span>}
    </Tooltip>