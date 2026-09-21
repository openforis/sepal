import {useState} from 'react'
import {useLocation} from 'react-router'

import {LanguageSelector} from '~/app/landing/languageSelector'
import {useSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {currentUser, loadUser$} from '~/user'
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
    const [addSubscriptions] = useSubscriptions()
    const location = useLocation()

    // The browser may have logged in since this tab landed here (another tab, a password reset):
    // a valid session takes the tab straight in, as loading the user hands it over to Home. The
    // outcome is read from the store once the load completes; what loadUser$ emits is not the user.
    const launch = () =>
        addSubscriptions(
            loadUser$().subscribe({
                complete: () => currentUser() || setLaunched(true)
            })
        )

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
        <Intro onLaunch={launch}/>
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
