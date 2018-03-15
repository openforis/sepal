import React from 'react'
import {msg} from 'translate'
import styles from './footer.module.css'
import {Button, IconButton} from 'widget/button'
import Icon from 'widget/icon'

const Footer = ({user, className}) =>
    <div className={`${className} ${styles.footer}`}>
        <div className={styles.firstSection}>
            <IconButton icon='tasks'/>
            <IconButton icon='users'/>
        </div>
        <div className={styles.secondSection}>
            <h2 className={styles.title}>
                <span className={styles._1}>S</span>
                <span className={styles._2}>e</span>
                <span className={styles._3}>p</span>
                <span className={styles._4}>a</span>
                <span className={styles._5}>l</span>
            </h2>
        </div>

        <div className={styles.thirdSection}>
            <span>
                <Icon name='usd'/> 0/h
            </span>

            <Button icon='user'>
                {user.username}
            </Button>

            <Button icon='sign-out'>
                {msg('home.logout')}
            </Button>
        </div>
    </div>
export default Footer