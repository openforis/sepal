const express = require('express')
const request = require('request')
const urljoin = require('url-join')
const randomColor = require('randomcolor')

const config = require('./config')

const app = express()

app.use(express.json())

app.use((err, req, res, next) => {
    console.info(err.stack)
    res.status(500).send('Something went wrong!!')
})

app.get('/login', (req, res, next) => {
    const {url, username, password, institutionId} = config.ceo
    request.post({
        url: urljoin(url, 'login'),
        form: {
            email: username,
            password: password,
        },
    }).on('response', response => {
        request.get({
            headers: {
                Cookie: response.headers['set-cookie'],
            },
            url: urljoin(url, 'account', institutionId),
            followRedirect: false,
        }).on('response', response => {
            const {statusCode} = response
            res.sendStatus(statusCode !== 302 ? 200 : 403)
        }).on('error', err => {
            next(err)
        })
    }).on('error', err => {
        next(err)
    })
})

app.post('/create-project', (req, res, next) => {
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
        institution: institutionId,
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
        plotFileName: 'plots.zip',
        plotFileBase64: ',' + Buffer.from(plotFile).toString('base64'),
        sampleFileName: '',
        sampleFileBase64: '',
    }
    request.post({
        url: urljoin(url, 'create-project'),
        json: data,
    }).on('response', response => {
        response.on('data', data => {
            const projectId = data.toString()
            const collectionUrl = urljoin(url, 'collection', projectId)
            res.send(collectionUrl)
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/get-collected-data/:id', (req, res, next) => {
    const {url} = config.ceo
    const {id} = req.params
    request.get({
        url: urljoin(url, 'get-project-by-id', id),
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
                url: urljoin(url, 'dump-project-raw-data', id),
            }).on('data', data => {
                const lines = data.toString().split('\n')
                const header = lines[0].split(',')
                const qIndex = header.findIndex(ele => ele === question.toUpperCase())
                const ret = lines.slice(1).reduce((acc, cur) => {
                    const values = cur.split(',')
                    const [id, , yCoord, xCoord] = values
                    const answer = values[qIndex]
                    const answerId = answersById[answer] || ''
                    return `${acc}\n${id},${yCoord},${xCoord},${answerId}`
                }, 'id,YCoordinate,XCoordinate,class')
                res.send(ret)
            }).on('error', err => {
                next(err)
            })
        })
    }).on('error', err => {
        next(err)
    })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, function() {
    console.info(`App listening on port ${PORT}!`)
})
