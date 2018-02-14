import React from 'react'
import {connect} from 'react-redux'
import {invalidCredentialsProvided, login} from 'user'
import {AnimateEnter, AnimateUl} from "../../widget/animate"
import CenteredPanel from 'widget/centered-panel'
import {Constraints, Input, managedForm} from 'widget/form'
import Icon from 'widget/icon'
import SlideShow from './slideshow/slideshow'
import styles from './landing.module.css'

const mapStateToProps = (state) => ({
    errors: invalidCredentialsProvided(state) ? {password: 'Invalid username/password'} : {}
})

const mapDispatchToProps = (dispatch) => ({
    onLogin: ({username, password}) => dispatch(login(username, password))
})

const Landing = connect(mapStateToProps, mapDispatchToProps)(
    ({errors, onLogin}) =>
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

                <AnimateEnter name={AnimateEnter.fadeInRight} delay={1500}>
                    <LoginForm
                        errors={errors}
                        onSubmit={onLogin}
                        initialState={{username: ''}}
                    />
                </AnimateEnter>
            </LandingPanel>
        </div>
)
export default Landing


const LandingPanel = ({children}) =>
    <CenteredPanel className={styles.landingPanel}>
        <div className={styles.contentContainer}>
            {children}
        </div>
    </CenteredPanel>

const Caption = () =>
    <p className={styles.caption}>
        System for earth observations, data access, processing & analysis for land monitoring
    </p>

const Title = () =>
    <div className={styles.titleSection}>
        <h2 className={styles.title}>Sepal</h2>
        <hr className={styles.titleUnderline}/>
    </div>

const Features = () =>
    <div className={styles.features}>
        <Feature
            icon='globe'
            title='Search geo data'
            description='Fast and easy access to scenes and mosaics'
            className={styles.searchIcon}
        />
        <Feature
            icon='folder-open'
            title='Browse your data'
            description='Preview and download your products'
            className={styles.browseIcon}
        />
        <Feature
            icon='wrench'
            title='Process your data'
            description='Easy-to-use data processing Apps'
            className={styles.processIcon}
        />
        <Feature
            icon='terminal'
            title='Terminal'
            description='Powerful command-line tools for data processing'
            className={styles.terminalIcon}
        />
    </div>

const Feature = ({icon, title, description, className}) =>
    <div className={styles.feature}>
        <Icon
            name={icon}
            className={`${styles.featureIcon} ${className}`}
        />
        <h3 className={styles.featureTitle}>{title}</h3>
        <p className={styles.featureDescription}>{description}</p>
    </div>


const LoginForm = managedForm({
    username: {
        constraints: new Constraints()
            .notBlank('Username is required')
    },
    password: {
        constraints: new Constraints().notBlank('Password is required')
    },
}, ({form, inputs: {username, password}}) => {
    return (
        <form style={styles.form}>
            <div>
                <label>Username</label>
                <Input
                    input={username}
                    placeholder='Enter your username'
                    autoFocus='on'
                    autoComplete='off'
                    tabIndex={1}
                    validate='onBlur'
                />
            </div>
            <div>
                <label>Password</label>
                <Input
                    input={password}
                    type='password'
                    placeholder='Enter your password'
                    tabIndex={2}
                    validate='onBlur'
                />
            </div>

            <AnimateUl className={form.errorClass}>
                {form.errors.map((error, i) =>
                    <li key={error}>{error}</li>
                )}
            </AnimateUl>

            <LoginButton
                onClick={form.submit}
                disabled={form.hasInvalid()}
                tabIndex={3}
            />

            <ForgotPassword tabIndex={4}/>
        </form>
    )
})

const LoginButton = ({tabIndex, onClick, ...props}) => {
    function handleClick(e) {
        e.preventDefault()
        onClick()
    }

    return (
        <button
            className={styles.loginButton}
            onClick={handleClick}
            tabIndex={tabIndex}
            {...props}
        >
            <Icon
                name='sign-in'
                className={styles.loginIcon}
            />
            Login
        </button>
    )
}

const ForgotPassword = ({tabIndex, onClick}) =>
    <div className={styles.forgotPassword}>
        <a
            onClick={onClick}
            tabIndex={tabIndex}>
            <Icon
                name='question-circle'
                className={styles.forgotPasswordIcon}
            />
            Forgot password
        </a>
    </div>