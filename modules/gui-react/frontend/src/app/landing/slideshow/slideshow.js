import React from 'react'
import background1 from './background1.jpg'
import background2 from './background2.jpg'
import styles from './slideshow.module.css'

const Slideshow = () =>
    <div className={styles.slideshow}>
        <img src={background1} className={styles.image1} alt=''/>
        <img src={background2} className={styles.image2} alt=''/>
        <div className={styles.overlay}/>
    </div>

export default Slideshow
