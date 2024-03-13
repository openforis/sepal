import {Button} from 'widget/button'
import {Credentials} from './credentials'
import {Feature} from './feature'
import {Intro} from './intro'
import {LanguageSelector} from 'app/landing/languageSelector'
import {Slideshow} from './slideshow/slideshow'
import {Tagline} from './tagline'
import {Title} from './title'
import {compose} from 'compose'
import {connect} from 'connect'
import {location} from 'route'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './landing.module.css'

const mapStateToProps = () => ({
    location: location()
})

class _Landing extends React.Component {
    state = {
        launched: false
    }

    render() {
        return (
            <div className={styles.container}>
                <Slideshow/>
                {this.renderContent()}
            </div>
        )
    }

    renderContent() {
        const {location} = this.props
        const {launched} = this.state
        const showIntro = location.pathname === '/' && !launched
        return showIntro
            ? this.renderIntro()
            : this.renderAuth()
    }

    renderIntro() {
        return (
            <Intro onLaunch={() => this.setState({launched: true})}/>
        )
    }

    renderAuth() {
        const {location} = this.props
        return (
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
                    <Credentials location={location}/>
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
    }
}

export const Landing = compose(
    _Landing,
    connect(mapStateToProps)
)

Landing.propTypes = {
    location: PropTypes.object
}
