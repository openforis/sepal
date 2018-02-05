import React from 'react'
import CenteredPanel from 'widget/centered-panel'
import SlideShow from 'app/login/slideshow/slideshow'
import FontAwesome from 'react-fontawesome'
import AnimateEnter from 'widget/animate'
import 'font-awesome/css/font-awesome.css';
import styles from './login.module.css'

export default class Login extends React.Component {
  login() {
    alert('Logging in')
  }

  render() {
    return (
      <div className={styles.login}>
        <SlideShow/>
        <LoginPanel>

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
            <LoginForm/>
          </AnimateEnter>

        </LoginPanel>
      </div>
    )
  }
}

Login.propTypes = {}

const LoginPanel = ({children}) =>
  <CenteredPanel className={styles.loginPanel}>
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
    <FontAwesome
      name={icon}
      className={`${styles.featureIcon} ${className}`}
    />
    <h3 className={styles.featureTitle}>{title}</h3>
    <p className={styles.featureDescription}>{description}</p>
  </div>

const LoginForm = () =>
  <form className={styles.form}>
    <FormField label='Username'>
      <input name='username' placeholder='Enter your user name' tabIndex='1'/>
    </FormField>
    <FormField label='Password'>
      <input type="password" name='password' placeholder='Enter your password' tabIndex='2'/>
    </FormField>
    <LoginButton tabIndex='3'/>
    <ForgotPassword tabIndex='4'/>
  </form>

const FormField = ({label, children}) =>
  <div className={styles.formField}>
    <label>{label}</label>
    {children}
  </div>

const LoginButton = ({tabIndex, onClick}) =>
  <button
    className={styles.loginButton}
    onClick={onClick}
    tabIndex={tabIndex}
  >
    <FontAwesome
      name='sign-in'
      className={styles.loginIcon}
    />
    Login
  </button>

const ForgotPassword = ({tabIndex, onClick}) =>
  <div className={styles.forgotPassword}>
    <a
      onClick={onClick}
      tabIndex={tabIndex}>
      <FontAwesome
        name='question-circle'
        className={styles.forgotPasswordIcon}
      />
      Forgot password
    </a>
  </div>