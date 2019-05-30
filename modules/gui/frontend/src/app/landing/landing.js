import {Msg} from 'translate'
import {compose} from 'compose'
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
                    <Msg id='landing.tagline'/>
                </div>
                <div className={styles.title}>
                    <Msg id='landing.title'/>
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
                    <a href={'/privacy-policy'} target="sepal-privacy-policy">
                        <Msg id='landing.privacyPolicy'/>
                    </a>
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
            <h3 className={styles.featureTitle}><Msg id={`landing.features.${name}.title`}/></h3>
            <p className={styles.featureDescription}><Msg id={`landing.features.${name}.description`}/></p>
        </div>
    </div>

Feature.propTypes = {
    icon: PropTypes.string,
    name: PropTypes.string
}
