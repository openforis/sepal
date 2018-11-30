import {AnimateEnter, AnimateReplacement} from '../../widget/animate'
import {Msg} from 'translate'
import {Route, Switch, location} from 'route'
import {connect} from 'react-redux'
import CenteredPanel from 'widget/centered-panel'
import ForgotPassword from './forgot-password'
import Icon from 'widget/icon'
import LanguageSelector from 'app/landing/languageSelector'
import Login from './login'
import PropTypes from 'prop-types'
import React from 'react'
import ResetPassword from './reset-password'
import SetupAccount from './setup-account'
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
                        <Features/>
                    </div>
                </div>
                <div className={styles.credentials}>
                    <div className={styles.content}>
                        <div className={styles.login}>
                            <Form location={location}/>
                        </div>
                        {/* <div className={styles.recover}>
                            RECOVER
                        </div> */}
                    </div>
                </div>
                <div className={styles.privacy}>
                    <div className={styles.content}>
                        <PrivacyPolicy/>
                    </div>
                </div>
            </div>
        </div>
        
// let Landing =
//     ({location}) =>
//         <div className={styles.landing}>
//             <SlideShow/>
//             <LandingPanel>
//                 <AnimateEnter name={AnimateEnter.fadeInUp} delay={1000} className={styles.captionSection}>
//                     <Caption/>
//                 </AnimateEnter>

//                 <AnimateEnter name={AnimateEnter.fadeInUp} delay={0} className={styles.titleSection}>
//                     <Title/>
//                 </AnimateEnter>

//                 <AnimateEnter name={AnimateEnter.fadeInLeft} delay={100} className={styles.featuresSection}>
//                     <Features/>
//                 </AnimateEnter>

//                 <AnimateEnter name={AnimateEnter.fadeInRight} delay={1500} className={styles.formSection}>
//                     <AnimateReplacement
//                         currentKey={location.pathname}
//                         classNames={{enter: styles.formEnter, exit: styles.formExit}}
//                         style={{height: '100%'}}>
//                         <Form location={location}/>
//                     </AnimateReplacement>
//                 </AnimateEnter>

//                 <AnimateEnter name={AnimateEnter.fadeInUp} delay={500} className={styles.languageSection}>
//                     <LanguageSelector/>
//                 </AnimateEnter>

//                 <AnimateEnter name={AnimateEnter.fadeInUp} delay={500} className={styles.privacySection}>
//                     <PrivacyPolicy/>
//                 </AnimateEnter>

//             </LandingPanel>
//         </div>

Landing.propTypes = {
    location: PropTypes.object
}

const LandingPanel = ({children}) =>
    <CenteredPanel className={styles.landingPanel}>
        <div className={styles.contentContainer}>
            {children}
        </div>
    </CenteredPanel>

LandingPanel.propTypes = {
    children: PropTypes.any
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

const Features = () =>
    <div className={styles.features}>
        <Feature name='process' icon='globe'/>
        <Feature name='browse' icon='folder-open'/>
        <Feature name='apps' icon='wrench'/>
        <Feature name='terminal' icon='terminal'/>
    </div>

const Feature = ({icon, name}) =>
    <div className={styles.feature}>
        <div className={`${styles.featureIcon} ${styles[`${name}Icon`]}`}>
            <Icon name={icon}/>
        </div>
        <h3 className={styles.featureTitle}><Msg id={`landing.features.${name}.title`}/></h3>
        <p className={styles.featureDescription}><Msg id={`landing.features.${name}.description`}/></p>
    </div>

Feature.propTypes = {
    icon: PropTypes.string,
    name: PropTypes.string
}

const Form = ({location}) =>
    <Switch location={location}>
        <Route path='/forgot-password' component={ForgotPassword}/>
        <Route path='/reset-password' component={ResetPassword}/>
        <Route path='/setup-account' component={SetupAccount}/>
        <Route path='/' component={Login}/>
    </Switch>

Form.propTypes = {
    location: PropTypes.object
}

export default connect(mapStateToProps)(Landing)

const PrivacyPolicy = () =>
    <a href={'/privacy-policy'}><Msg id='landing.privacyPolicy'/></a>
