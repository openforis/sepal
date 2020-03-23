import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {msg} from 'translate'
import React from 'react'
import Tagline from './tagline'
import Title from './title'
import image_01 from './intro/bhutan.jpg'
import image_02 from './intro/senegal.jpg'
import image_03 from './intro/namibia.jpg'
import image_04 from './intro/terminal.jpg'
import image_gee from './intro/tools/gee.png'
import image_jupyter from './intro/tools/jupyter.png'
import image_rstudio from './intro/tools/rstudio.png'
import image_shiny from './intro/tools/shiny.jpg'
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
import partner_openforis from './intro/partners/openforis.png'
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
                            size='x-large'
                            label={msg('landing.signup')}
                            tabIndex={1}
                            linkUrl={signupUrl}
                            linkTarget='_self'
                        />
                        <Button
                            type='submit'
                            look='apply'
                            size='x-large'
                            icon={'sign-in-alt'}
                            label={msg('landing.launch')}
                            tabIndex={2}
                            onClick={onLaunch}
                        />
                    </ButtonGroup>
                </div>
                <div className={[styles.block, styles.dark, styles.imageLeft, styles.responsive].join(' ')}>
                    <img src={image_01} alt=""/>
                    <div>
                        <div className={styles.title}>EASE OF USE</div>
                        <p>Allows users to query and process satellite data quickly and efficiently, tailor their products for local needs, and produce sophisticated and relevant geospatial analyses quickly.</p>
                    </div>
                </div>
                <div className={[styles.block, styles.dark, styles.imageRight, styles.responsive].join(' ')}>
                    <img src={image_02} alt=""/>
                    <div>
                        <div className={styles.title}>COMPUTING POWER</div>
                        <p>Harnessing high performance cloud-based computing and modern geospatial data infrastructures.</p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageLeft].join(' ')}>
                    <img src={image_gee} alt='' width={150}/>
                    <div>
                        <div className={styles.title}>GOOGLE EARTH ENGINE</div>
                        <p>
                            Produce global scale products with EE without writing scripts
                            Connect your Google account, and export to your EE asset folder
                            or to your Sepal workspace, for further processing.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageRight].join(' ')}>
                    <img src={image_rstudio} alt='' width={150}/>
                    <div>
                        <div className={styles.title}>RSTUDIO SERVER</div>
                        <p>
                            Sepal includes an RStudio Server installation.
                            This makes it easy to develop and run your custom R scripts.
                            Connect your Google account, and export to your EE asset folder
                            or to your Sepal workspace, for further processing.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageLeft].join(' ')}>
                    <img src={image_jupyter} alt='' width={150}/>
                    <div>
                        <div className={styles.title}>JUPYTER NOTEBOOK</div>
                        <p>
                            Produce global scale products with EE without writing scripts.
                            Connect your Google account, and export to your EE asset folder
                            or to your Sepal workspace, for further processing.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageRight].join(' ')}>
                    <img src={image_shiny} alt='' width={150}/>
                    <div>
                        <div className={styles.title}>SHINY SERVER</div>
                        <p>
                            Sepal includes an RStudio Server installation.
                            This makes it easy to develop and run your custom R scripts.
                            Connect your Google account, and export to your EE asset folder
                            or to your Sepal workspace, for further processing.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.dark, styles.imageLeft, styles.responsive].join(' ')}>
                    <img src={image_03} alt=''/>
                    <div>
                        <div className={styles.title}>INTEGRATIONS</div>
                        <p>
                            Sepal integrates with other system, including Collect Earth Online,
                            for visual interpretation of images.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.dark, styles.imageRight, styles.responsive].join(' ')}>
                    <img src={image_04} alt=''/>
                    <div>
                        <div className={styles.title}>POWER USERS</div>
                        <p>
                            Get access to a full Linux terminal,
                            with a host of progrmming languages and geospatial tools installed.
                            Access the terminal over SSH, transfer files using rsync,
                            scp, or connect an FPT client.
                            Start sessions on different instance types,
                            ranging up to 128 core, 2TB instances.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageLeft].join(' ')}>
                    <div className={styles.img}>
                        <img src={partner_openforis} alt=''/>
                        <img src={partner_nicfi} alt=''/>
                    </div>
                    <div>
                        <div className={styles.title}>PROJECT BY</div>
                        <p>The Open Foris team in Forestry Department of the United Nations Food and Agriculture Organization (FAO), funded by the Government of Norway.</p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageCenter].join(' ')}>
                    <div>
                        <div className={styles.title}>PARTNERS</div>
                    </div>
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
                        <img src={partner_sc} alt=''/>
                        <img src={partner_servir} alt=''/>
                        <img src={partner_sig} alt=''/>
                        <img src={partner_wageningen} alt=''/>
                    </div>
                </div>
                <div className={styles.footer}>
                    <Button
                        chromeless
                        look='transparent'
                        shape='pill'
                        size='x-large'
                        linkUrl='http://www.openforis.org'
                        linkTarget='openforis'
                        label='Openforis'>
                    </Button>
                    <Button
                        chromeless
                        look='transparent'
                        shape='pill'
                        size='x-large'
                        linkUrl='https://github.com/openforis/sepal'
                        linkTarget='github-project'
                        label='GitHub'>
                    </Button>
                    <Button
                        chromeless
                        look='transparent'
                        shape='pill'
                        size='x-large'
                        linkUrl='/privacy-policy'
                        linkTarget='privacy-policy'
                        label={msg('landing.privacyPolicy')}>
                    </Button>
                </div>
            </div>
        </Scrollable>
    </ScrollableContainer>

export default Intro
