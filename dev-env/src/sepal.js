#!/usr/bin/node

import {program} from 'commander'
import {showStatus, reset} from './utils.js'
import {build} from './build.js'
import {start} from './start.js'
import {stop} from './stop.js'
import {restart} from './restart.js'
import {run} from './run.js'
import {log} from './log.js'

const main = async () => {
    process.on('SIGINT', () => reset())

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
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to build')
        .action(build)
    
    program.command('start')
        .description('Start modules')
        .option('-d, --dependencies', 'Show dependencies')
        .option('-r, --recursive', 'Recursive', true)
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to start')
        .action(start)
    
    program.command('stop')
        .description('Stop modules')
        .option('-d, --dependencies', 'Show dependencies')
        .option('-r, --recursive', 'Recursive', false)
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to stop')
        .action(stop)
    
    program.command('restart')
        .description('Restart modules')
        .option('-d, --dependencies', 'Show dependencies')
        .option('-r, --recursive', 'Recursive')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to restart')
        .action(restart)
    
    program.command('run')
        .description('Run a single module with log tail')
        .option('-d, --dependencies', 'Show dependencies')
        .option('-r, --recursive', 'Recursive', true)
        .argument('<module>', 'Module to run')
        .action(run)
    
    try {
        await program.parseAsync(process.argv)
    } catch (error) {
        if (!['commander.helpDisplayed', 'commander.help', 'commander.version', 'commander.unknownOption', 'commander.unknownCommand'].includes(error.code)) {
            log.error(error)
        }
    }
    reset()
}

main().catch(log.error)
