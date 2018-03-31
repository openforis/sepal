import React from 'react'
import {msg} from 'translate'
import styles from './footer.module.css'
import {Button, IconButton} from 'widget/button'
import Icon from 'widget/icon'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {logout} from 'user'
import PropTypes from 'prop-types'

const Footer = ({user, className}) => {
    return (
        <div className={`${className} ${styles.footer}`}>
            <Section className={styles.firstSection}>
                <Tasks/>
                {user.admin ? <ManageUsers/> : null}
            </Section>

            <Section className={styles.secondSection}>
                <Title/>
            </Section>

            <Section className={styles.thirdSection}>
                <HourlyCost/>
                <Account user={user}/>
                <Logout/>
            </Section>
        </div>
    )
}

Footer.propTypes = {
    user: PropTypes.object,
    className: PropTypes.string
}

const Section = ({className, children}) =>
    <div className={className}>
        <div>
            {children}
        </div>
    </div>

Section.propTypes = {
    className: PropTypes.string,
    children: PropTypes.object
}

const Tasks = () =>
    <Link to={'/tasks'} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg='home.footer.tasks' topRight>
            <IconButton icon='tasks'/>
        </Tooltip>
    </Link>

const ManageUsers = () =>
    <Link to={'/users'} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg='home.footer.manageUsers' topRight>
            <IconButton icon='users'/>
        </Tooltip>
    </Link>

const Title = () =>
    <h2 className={styles.title}>
        <span className={styles._1}>S</span>
        <span className={styles._2}>e</span>
        <span className={styles._3}>p</span>
        <span className={styles._4}>a</span>
        <span className={styles._5}>l</span>
    </h2>

const HourlyCost = () =>
    <span className={styles.hourlyCost}>
        <Icon name='usd'/> 0/h
    </span>

const Account = ({user}) =>
    <Link to={'/account'} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg='home.footer.account' top>
            <Button icon='user' className={styles.user}>
                {user.username}
            </Button>
        </Tooltip>
    </Link>

Account.propTypes = {
    user: PropTypes.object
}

const Logout = () =>
    <Tooltip msg='home.footer.logout' top>
        <Button icon='sign-out' className={styles.logout} onClick={logout}>
            {msg('home.footer.logout.label')}
        </Button>
    </Tooltip>

export default Footer
