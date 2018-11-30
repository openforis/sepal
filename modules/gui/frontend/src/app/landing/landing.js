import {Msg} from 'translate'
import {connect} from 'store'
import {location} from 'route'
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
                    <div className={styles.content}>
                        <Caption/>
                    </div>
                </div>
                <div className={styles.title}>
                    <div className={styles.content}>
                        <Title/>
                    </div>
                </div>
                <div className={styles.language}>
                    <div className={styles.content}>
                        <LanguageSelector/>
                    </div>
                </div>
                <div className={styles.features}>
                    <div className={styles.content}>
                        <Feature name='process' icon='globe'/>
                        <Feature name='browse' icon='folder-open'/>
                        <Feature name='apps' icon='wrench'/>
                        <Feature name='terminal' icon='terminal'/>
                    </div>
                </div>
                <div className={styles.credentials}>
                    <div className={styles.content}>
                        <Credentials location={location}/>
                    </div>
                </div>
                <div className={styles.privacy}>
                    <div className={styles.content}>
                        <PrivacyPolicy/>
                    </div>
                </div>
            </div>
        </div>
        
export default connect(mapStateToProps)(Landing)

Landing.propTypes = {
    location: PropTypes.object
}

const Caption = () =>
    <p className={styles.caption}>
        <Msg id='landing.caption'/>
    </p>

const Title = () =>
    <div className={styles.titleSection}>
        <h2 className={styles.title}><Msg id='landing.title'/></h2>
        <hr className={styles.titleUnderline}/>
    </div>

const Feature = ({icon, name}) =>
    <div className={styles.feature}>
        <div className={[styles.featureIcon, styles[name]].join(' ')}>
            <Icon name={icon}/>
        </div>
        <div>
            <h3 className={styles.featureTitle}><Msg id={`landing.features.${name}.title`}/></h3>
            <p className={styles.featureDescription}><Msg id={`landing.features.${name}.description`}/></p>
        </div>
    </div>

Feature.propTypes = {
    icon: PropTypes.string,
    name: PropTypes.string
}

const PrivacyPolicy = () =>
    <a href={'/privacy-policy'}><Msg id='landing.privacyPolicy'/></a>
