import {useState} from 'react'
import {useLocation} from 'react-router'

import {LanguageSelector} from '~/app/landing/languageSelector'
import {msg} from '~/translate'
import {Button} from '~/widget/button'

import {Credentials} from './credentials'
import {Feature} from './feature'
import {Intro} from './intro'
import styles from './landing.module.css'
import {Slideshow} from './slideshow/slideshow'
import {Tagline} from './tagline'
import {Title} from './title'

export const Landing = () => {
    const [launched, setLaunched] = useState(false)
    const location = useLocation()

    const renderAuth = () => (
        <div className={styles.landing}>
            <Tagline className={styles.tagline}/>
            <Title className={styles.title}/>
            <div className={styles.language}>
                <LanguageSelector/>
            </div>
            <div className={styles.features}>
                <Feature name='process' icon='globe'/>
                <Feature name='browse' icon='folder-open'/>
                <Feature name='apps' icon='wrench'/>
                <Feature name='terminal' icon='terminal'/>
            </div>
            <div className={styles.credentials}>
                <Credentials/>
            </div>
            <div className={styles.privacy}>
                <Button
                    chromeless
                    look='transparent'
                    shape='pill'
                    linkUrl='/privacy-policy'
                    linkTarget='sepal-privacy-policy'
                    label={msg('landing.privacyPolicy')}>
                </Button>
            </div>
        </div>
    )

    const renderIntro = () => (
        <Intro onLaunch={() => setLaunched(true)}/>
    )

    const renderContent = () => {
        const showIntro = location.pathname === '/' && !launched
        return showIntro
            ? renderIntro()
            : renderAuth()
    }

    return (
        <div className={styles.container}>
            <Slideshow/>
            {renderContent()}
        </div>
    )
}
