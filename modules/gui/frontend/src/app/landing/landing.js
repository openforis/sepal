import {Button} from 'widget/button'
import {compose} from 'compose'
import {connect} from 'store'
import {location} from 'route'
import {msg} from 'translate'
import Credentials from './credentials'
import Icon from 'widget/icon'
import LanguageSelector from 'app/landing/languageSelector'
import PropTypes from 'prop-types'
import React from 'react'
import SlideShow from './slideshow/slideshow'
import styles from './landing.module.css'

const mapStateToProps = () => ({
    location: location()
})

const Landing =
    ({location}) =>
        <div className={styles.container}>
            <SlideShow/>
            <div className={styles.landing}>
                <div className={styles.tagline}>
                    {msg('landing.tagline')}
                </div>
                <div className={styles.title}>
                    {msg('landing.title')}
                    <hr className={styles.titleUnderline}/>
                </div>
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
                    <Credentials location={location}/>
                </div>
                <div className={styles.privacy}>
                    <Button
                        chromeless
                        look='transparent'
                        shape='pill'
                        link='/privacy-policy'
                        linkTarget='sepal-privacy-policy'
                        label={msg('landing.privacyPolicy')}>
                    </Button>
                </div>
            </div>
        </div>
        
export default compose(
    Landing,
    connect(mapStateToProps)
)

Landing.propTypes = {
    location: PropTypes.object
}

const Feature = ({icon, name}) =>
    <div className={styles.feature}>
        <div className={[styles.featureIcon, styles[name]].join(' ')}>
            <Icon name={icon}/>
        </div>
        <div>
            <h3 className={styles.featureTitle}>
                {msg(`landing.features.${name}.title`)}
            </h3>
            <p className={styles.featureDescription}>
                {msg(`landing.features.${name}.description`)}
            </p>
        </div>
    </div>

Feature.propTypes = {
    icon: PropTypes.string,
    name: PropTypes.string
}
