#!/usr/bin/node

import {program} from 'commander'
import {showStatus, exit} from './utils.js'
import {build} from './build.js'
import {start} from './start.js'
import {stop} from './stop.js'
import {run} from './run.js'
import {logs} from './logs.js'
import {log} from './log.js'

const main = async () => {
    process.on('SIGINT', () => exit({interrupted: true}))

    program.exitOverride()

    program
        .name('sepal')
        .description('CLI to manage SEPAL modules')
        .version('1.0.0')
    
    program.command('status')
        .description('Show modules status')
        .option('-d, --dependencies', 'Show all dependencies')
        .option('-bd, --build-dependencies', 'Show build dependencies')
        .option('-dd, --direct-dependencies', 'Show direct dependencies')
        .option('-id, --inverse-dependencies', 'Show inverse dependencies')
        .argument('[module...]', 'Modules to show')
        .action(showStatus)
    
    program.command('build')
        .description('Build modules')
        .option('-nc, --no-cache', 'No cache')
        .option('-r, --recursive', 'Recursive')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to build')
        .action(build)
    
    program.command('start')
        .description('Start modules')
        .option('-s, --stop', 'Stop and restart')
        .option('-sd, --stop-dependencies', 'Stop and restart dependencies too')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to start')
        .action(start)
    
    program.command('stop')
        .description('Stop modules')
        .option('-r, --recursive', 'Stop dependencies too')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to stop')
        .action(stop)
    
    program.command('run')
        .description('Run a single module with log tail')
        .option('-b, --build', 'Build')
        .option('-r, --recursive', 'Recursive', true)
        .argument('<module>', 'Module to run')
        .action(run)
    
    program.command('logs')
        .description('Show module log')
        .option('-f, --follow', 'Follow')
        .argument('<module>', 'Module')
        .action(logs)
    
    try {
        await program.parseAsync(process.argv)
        exit({normal: true})
    } catch (error) {
        if (!['commander.helpDisplayed', 'commander.help', 'commander.version', 'commander.unknownOption', 'commander.unknownCommand'].includes(error.code)) {
            exit({error})
        }
    }
}

main().catch(log.error)
