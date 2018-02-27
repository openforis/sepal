import React from 'react'
import {AnimateEnter, AnimateReplacement} from '../../widget/animate'
import CenteredPanel from 'widget/centered-panel'
import Icon from 'widget/icon'
import SlideShow from './slideshow/slideshow'
import {Msg} from 'translate'
import Login from './login'
import ForgotPassword from './forgot-password'
import ResetPassword from './reset-password'
import SetupAccount from './setup-account'
import styles from './landing.module.css'
import {Route, Switch} from 'route'
import {observer, Reducer} from 'observer'
import location$ from 'location'

let Landing =
    ({location}) =>
        <div className={styles.landing}>
            <SlideShow/>
            <LandingPanel>
                <AnimateEnter name={AnimateEnter.fadeInUp} delay={1000}>
                    <Caption/>
                </AnimateEnter>

                <AnimateEnter name={AnimateEnter.fadeInUp} delay={0}>
                    <Title/>
                </AnimateEnter>

                <AnimateEnter name={AnimateEnter.fadeInLeft} delay={100}>
                    <Features/>
                </AnimateEnter>

                <AnimateEnter name={AnimateEnter.fadeInRight} delay={1500} className={styles.form}>
                    <AnimateReplacement
                        currentKey={location.pathname}
                        classNames={{enter: styles.formEnter, exit: styles.formExit}}>
                        <Form location={location}/>
                    </AnimateReplacement>
                </AnimateEnter>
            </LandingPanel>
        </div>

export default Landing = observer(Landing, {
    reducers:
        [
            new Reducer(location$, (location) => ({
                location: location
            }))
        ]
})

const LandingPanel = ({children}) =>
    <CenteredPanel className={styles.landingPanel}>
        <div className={styles.contentContainer}>
            {children}
        </div>
    </CenteredPanel>

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
        <Feature name='search' icon='globe'/>
        <Feature name='browse' icon='folder-open'/>
        <Feature name='process' icon='wrench'/>
        <Feature name='terminal' icon='terminal'/>
    </div>

const Feature = ({icon, name}) =>
    <div className={styles.feature}>
        <Icon
            name={icon}
            className={`${styles.featureIcon} ${styles[`${name}Icon`]}`}
        />
        <h3 className={styles.featureTitle}><Msg id={`landing.features.${name}.title`}/></h3>
        <p className={styles.featureDescription}><Msg id={`landing.features.${name}.description`}/></p>
    </div>

const Form = ({location}) =>
    <Switch location={location}>
        <Route path='/forgot-password' component={ForgotPassword}/>
        <Route path='/reset-password' component={ResetPassword}/>
        <Route path='/setup-account' component={SetupAccount}/>
        <Route path='/' component={Login}/>
    </Switch>
