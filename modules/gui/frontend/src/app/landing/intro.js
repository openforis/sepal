import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {msg} from 'translate'
import Feature from './feature'
import React from 'react'
import Tagline from './tagline'
import Title from './title'
import image_01 from './intro/01.png'
import image_02 from './intro/02.png'
import image_03 from './intro/03.png'
import image_04 from './intro/04.png'
import image_gee from './intro/gee.png'
import image_jupyter from './intro/jupyter.png'
import image_rstudio from './intro/rstudio.png'
import image_shiny from './intro/shiny.jpg'
import partner_ec from './intro/partners/ec.png'
import partner_esa from './intro/partners/esa.png'
import partner_eth from './intro/partners/eth.png'
import partner_formin from './intro/partners/formin.png'
import partner_germany from './intro/partners/germany.png'
import partner_gfoi from './intro/partners/gfoi.png'
import partner_google from './intro/partners/google.png'
import partner_jaxa from './intro/partners/jaxa.png'
import partner_jica from './intro/partners/jica.png'
import partner_kfw from './intro/partners/kfw.png'
import partner_nasa from './intro/partners/nasa.png'
import partner_nicfi from './intro/partners/nicfi.png'
import partner_sc from './intro/partners/sc.png'
import partner_servir from './intro/partners/servir.png'
import partner_sig from './intro/partners/sig.png'
import partner_wageningen from './intro/partners/wageningen.png'
import styles from './intro.module.css'

const signupUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSci4hopXNtMOQKJzsUybaJETrAPQp8j6TCqycSBQ0XO37jBwA/viewform?c=0&w=1'

const Intro = ({onLaunch}) =>
    <ScrollableContainer>
        <Scrollable>
            <div className={styles.intro}>
                <div className={styles.main}>
                    <Title className={styles.title}/>
                    <Tagline className={styles.tagline}/>
                    <ButtonGroup layout='horizontal-nowrap'>
                        <Button
                            look='default'
                            size='xx-large'
                            label={msg('landing.signup')}
                            tabIndex={1}
                            linkUrl={signupUrl}
                            linkTarget='_self'
                        />
                        <Button
                            type='submit'
                            look='apply'
                            size='xx-large'
                            icon={'sign-in-alt'}
                            label={msg('landing.launch')}
                            tabIndex={2}
                            onClick={onLaunch}
                        />
                    </ButtonGroup>
                </div>
                {/* <div className={styles.features}>
                    <Feature name='process' icon='globe'/>
                    <Feature name='browse' icon='folder-open'/>
                    <Feature name='apps' icon='wrench'/>
                    <Feature name='terminal' icon='terminal'/>
                </div> */}
                <div className={[styles.block, styles.imageLeft].join(' ')}>
                    <div>EASE OF USE</div>
                    <img src={image_01} alt=""/>
                    <p>Allows users to query and process satellite data quickly and efficiently, tailor their products for local needs, and produce sophisticated and relevant geospatial analyses quickly.</p>
                </div>
                <div className={[styles.block, styles.imageRight].join(' ')}>
                    <div>COMPUTING POWER</div>
                    <img src={image_02} alt=""/>
                    <p>Harnessing high performance cloud-based computing and modern geospatial data infrastructures.</p>
                </div>
                <div className={[styles.block, styles.contrast, styles.imageLeft].join(' ')}>
                    <div>GOOGLE EARTH ENGINE</div>
                    <img src={image_gee} alt='' width={150}/>
                    <p>
                        Produce global scale products with EE without writing scripts
                        Connect your Google account, and export to your EE asset folder
                        or to your Sepal workspace, for further processing.
                    </p>
                </div>
                <div className={[styles.block, styles.contrast, styles.imageRight].join(' ')}>
                    <div>RSTUDIO SERVER</div>
                    <img src={image_rstudio} alt='' width={150}/>
                    <p>
                        Sepal includes an RStudio Server installation.
                        This makes it easy to develop and run your custom R scripts.
                        Connect your Google account, and export to your EE asset folder
                        or to your Sepal workspace, for further processing.
                    </p>
                </div>
                <div className={[styles.block, styles.contrast, styles.imageLeft].join(' ')}>
                    <div>JUPYTER NOTEBOOK</div>
                    <img src={image_jupyter} alt='' width={150}/>
                    <p>
                        Produce global scale products with EE without writing scripts.
                        Connect your Google account, and export to your EE asset folder
                        or to your Sepal workspace, for further processing.
                    </p>
                </div>
                <div className={[styles.block, styles.contrast, styles.imageRight].join(' ')}>
                    <div>SHINY SERVER</div>
                    <img src={image_shiny} alt='' width={150}/>
                    <p>
                        Sepal includes an RStudio Server installation.
                        This makes it easy to develop and run your custom R scripts.
                        Connect your Google account, and export to your EE asset folder
                        or to your Sepal workspace, for further processing.
                    </p>
                </div>
                <div className={[styles.block, styles.imageLeft].join(' ')}>
                    <div>INTEGRATIONS</div>
                    <img src={image_03} alt=''/>
                    <p>
                        Sepal integrates with other system, including Collect Earth Online,
                        for visual interpretation of images.
                    </p>
                </div>
                <div className={[styles.block, styles.imageRight].join(' ')}>
                    <div>POWER USERS</div>
                    <img src={image_04} alt=''/>
                    <p>
                        Get access to a full Linux terminal,
                        with a host of progrmming languages and geospatial tools installed.
                        Access the terminal over SSH, transfer files using rsync,
                        scp, or connect an FPT client.
                        Start sessions on different instance types,
                        ranging up to 128 core, 2TB instances.
                    </p>
                </div>
                <div className={[styles.block, styles.contrast, styles.imageLeft].join(' ')}>
                    <div>PARTNERS</div>
                    <div className={styles.img}>
                        <img src={partner_ec} alt=''/>
                        <img src={partner_esa} alt=''/>
                        <img src={partner_eth} alt=''/>
                        <img src={partner_formin} alt=''/>
                        <img src={partner_germany} alt=''/>
                        <img src={partner_gfoi} alt=''/>
                        <img src={partner_google} alt=''/>
                        <img src={partner_jaxa} alt=''/>
                        <img src={partner_jica} alt=''/>
                        <img src={partner_kfw} alt=''/>
                        <img src={partner_nasa} alt=''/>
                        <img src={partner_nicfi} alt=''/>
                        <img src={partner_sc} alt=''/>
                        <img src={partner_servir} alt=''/>
                        <img src={partner_sig} alt=''/>
                        <img src={partner_wageningen} alt=''/>
                    </div>
                </div>
            </div>
        </Scrollable>
    </ScrollableContainer>

export default Intro
