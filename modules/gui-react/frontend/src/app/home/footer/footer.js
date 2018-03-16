import React from 'react'
import {msg} from 'translate'
import styles from './footer.module.css'
import {Button, IconButton} from 'widget/button'
import Icon from 'widget/icon'

const Footer = ({user, className}) =>
    <div className={`${className} ${styles.footer}`}>
        <div className={styles.firstSection}>
            <div>
                <IconButton icon='tasks'/>
                <IconButton icon='users'/>
            </div>
        </div>

        <Title/>

        <div className={styles.thirdSection}>
            <div>
                <span className={styles.hourlyCost}>
                    <Icon name='usd'/> 0/h
                </span>

                <Button icon='user' classNames={styles.user}>
                    {user.username}
                </Button>

                <Button icon='sign-out' classNames={styles.logout}>
                    {msg('home.logout')}
                </Button>
            </div>
        </div>
    </div>
export default Footer

const Title = ({}) =>
    <div className={styles.secondSection}>
        <div>
            <h2 className={styles.title}>
                <span className={styles._1}>S</span>
                <span className={styles._2}>e</span>
                <span className={styles._3}>p</span>
                <span className={styles._4}>a</span>
                <span className={styles._5}>l</span>
            </h2>
        </div>
    </div>