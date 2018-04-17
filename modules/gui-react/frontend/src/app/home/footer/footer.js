import React from 'react'
import styles from './footer.module.css'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'
import {logout} from 'user'

const Footer = ({className, user}) => {
    return (
        <div className={className}>
            <div className={styles.footer}>
                {/* <Title/> */}
                <div>
                    <Logout/>
                    <User user={user}/>
                </div>
                <a href={'https://github.com/openforis/sepal/wiki'} target={'wiki'}>
                    <span className={styles.sepal}>SEPAL</span>
                    <Copyright/>
                </a>
                <HourlyCost/>
            </div>
        </div>
    )
}

Footer.propTypes = {
    user: PropTypes.object,
    className: PropTypes.string
}

// const Title = () =>
//     <h2 className={styles.title}>
//         <span className={styles._1}>S</span>
//         <span className={styles._2}>e</span>
//         <span className={styles._3}>p</span>
//         <span className={styles._4}>a</span>
//         <span className={styles._5}>l</span>
//     </h2>

const Logout = () =>
    <Tooltip msg='home.sections.logout' top>
        <button className={styles.logout} onClick={logout}>
            <Icon name={'sign-out-alt'}/>
        </button>
    </Tooltip>

const User = ({user}) =>
    <span className={styles.user}>
        {user.username}
    </span>

User.propTypes = {
    user: PropTypes.object
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy; 20xx - {thisYear}</span>
}

const HourlyCost = () =>
    <div className={styles.hourlyCost}>
        <Icon name='dollar-sign'/> 0/h
    </div>

export default Footer
