const express = require('express')
const session = require('express-session')
const request = require('request')
const urljoin = require('url-join')
const randomColor = require('randomcolor')

const config = require('./config')

const app = express()

app.use(session({
    secret: '343ji43j4n3jn4jk3n',
    resave: false,
    saveUninitialized: true
}))

app.use(express.json())

app.use(['/login', '/create-project', '/get-collected-data'], (req, res, next) => {
    const {url, username, password, userId} = config.ceo
    request.post({
        url: urljoin(url, 'login'),
        form: {
            email: username,
            password,
        },
    }).on('response', response => {
        const cookie = response.headers['set-cookie']
        req.session.cookie = cookie
        request.get({
            headers: {
                Cookie: cookie,
            },
            url: urljoin(url, 'account'),
            qs: {
                userId
            },
            followRedirect: false,
        }).on('response', response => {
            const {statusCode} = response
            req.loginStatusCode = statusCode !== 302 ? 200 : 403
            req.isLogged = statusCode !== 302 ? true : false
            next()
        }).on('error', err => {
            next(err)
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/login', (req, res, next) => {
    res.sendStatus(req.loginStatusCode)
})

app.post('/create-project', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {cookie} = req.session
    const {url, institutionId} = config.ceo
    const {classes, plotSize, plots, title} = req.body
    if (!Array.isArray(classes) || classes.length === 0
        || typeof plotSize !== 'number' || plotSize < 0
        || !Array.isArray(plots) || plots.length === 0
        || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).send('Bad Request')
    }
    const plotFile = plots.reduce((acc, curr, i) => {
        return `${acc}\n${curr.lon},${curr.lat},${i+1}`
    }, 'LON,LAT,PLOTID')
    const colors = randomColor({
        count: classes.length,
        hue: 'random',
    })
    const sampleValues = [{
        id: 1,
        question: 'CLASS',
        answers: classes.map(function(currentValue, index) {
            return {
                id: index + 1,
                answer: currentValue,
                color: colors[index],
            }
        }),
        parentQuestion: -1,
        parentAnswer: -1,
        dataType: 'text',
        componentType: 'button',
    }]
    const data = {
        baseMapSource: 'DigitalGlobeRecentImagery',
        description: title,
        institutionId,
        lonMin: '',
        lonMax: '',
        latMin: '',
        latMax: '',
        name: title,
        numPlots: '',
        plotDistribution: 'csv',
        plotShape: 'square',
        plotSize: plotSize,
        plotSpacing: '',
        privacyLevel: 'private',
        projectTemplate: '0',
        sampleDistribution: 'gridded',
        samplesPerPlot: '',
        sampleResolution: plotSize,
        sampleValues: sampleValues,
        surveyRules: [],
        useTemplatePlots: '',
        useTemplateWidgets: '',
        plotFileName: 'plots.csv',
        plotFileBase64: ',' + Buffer.from(plotFile).toString('base64'),
        sampleFileName: '',
        sampleFileBase64: '',
    }
    request.post({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'create-project'),
        qs: {
            institutionId,
        },
        json: data,
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const projectId = data.toString()
            if (isNaN(projectId)) {
                res.status(400).send({
                    projectId: 0,
                    ceoCollectionUrl: '',
                    errorMessage: projectId,
                })
            } else {
                const ceoCollectionUrl = urljoin(url, 'collection', projectId)
                res.send({
                    projectId,
                    ceoCollectionUrl,
                    errorMessage: '',
                })
            }
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/get-collected-data/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {cookie} = req.session
    const {url} = config.ceo
    const {id} = req.params
    request.get({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'get-project-by-id'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const project = JSON.parse(data.toString())
            const [sampleValue] = project.sampleValues
            const {question, answers} = sampleValue
            if (!question || !answers) return res.sendStatus(500)
            const answersById = answers.reduce((acc, cur) => {
                acc[cur.answer] = cur.id
                return acc
            }, {})
            request.get({
                headers: {
                    Cookie: cookie['0'],
                },
                url: urljoin(url, 'dump-project-raw-data'),
                qs: {
                    projectId: id,
                },
            }).on('response', response => {
                let body = ''
                response.on('data', data => {
                    body += data
                }).on('end', () => {
                    const lines = body.toString().split('\n')
                    const header = lines[0].split(',')
                    const qIndex = header.findIndex(ele => ele === question.toUpperCase())
                    const ret = lines.slice(1).reduce((acc, cur) => {
                        const values = cur.split(',')
                        const [id, , yCoord, xCoord] = values
                        const answer = values[qIndex] || ''
                        const answerId = answersById[answer] || ''
                        return `${acc}\n${id},${yCoord},${xCoord},${answerId},${answer}`
                    }, 'id,YCoordinate,XCoordinate,class,editedClass')
                    res.send(ret)
                })
            }).on('error', err => {
                next(err)
            })
        })
    }).on('error', err => {
        next(err)
    })
})

app.use((err, req, res, next) => {
    console.info(err.stack)
    res.status(500).send('Something went wrong!')
})

const PORT = process.env.PORT || 3000

app.listen(PORT, function() {
    console.info(`App listening on port ${PORT}!`)
})
