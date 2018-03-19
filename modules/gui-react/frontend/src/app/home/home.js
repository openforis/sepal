import React from 'react'
import PropTypes from 'prop-types'
import styles from './home.module.css'
import Sections from './sections/sections'
import Footer from './footer/footer'


const Home = ({user}) =>
    <div className={styles.home}>
        <Sections/>
        <Footer className={styles.footer} user={user}/>
        <Body/>
    </div>
export default Home

Home.propTypes = {
    user: PropTypes.object.isRequired
}

const Body = () =>
    <div className={styles.body}>
        Body
    </div>