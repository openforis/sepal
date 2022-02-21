#!/usr/bin/node

import {program, Option} from 'commander'
import {showStatus, exit} from './utils.js'
import {build} from './build.js'
import {start} from './start.js'
import {stop} from './stop.js'
import {restart} from './restart.js'
import {run} from './run.js'
import {logs} from './logs.js'
import {log} from './log.js'
import {update} from './update.js'

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
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to start')
        .action(start)
    
    program.command('stop')
        .description('Stop modules')
        .option('-d, --dependencies', 'Stop dependencies too')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to stop')
        .action(stop)
    
    program.command('restart')
        .description('Restart modules')
        .option('-d, --dependencies', 'Restart dependencies too')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to start')
        .action(restart)
    
    program.command('run')
        .description('Restart a single module and show log tail')
        .option('-d, --dependencies', 'Restart dependencies too')
        .option('-b, --build', 'Build')
        .argument('<module>', 'Module to run')
        .action(run)
    
    program.command('logs')
        .description('Show module log')
        .option('-f, --follow', 'Follow')
        .argument('<module>', 'Module')
        .action(logs)
    
    program.command('update')
        .description('Update modules')
        .option('-c, --check', 'Check only')
        .addOption(new Option('-t, --target <target>', 'Update target').choices(['patch', 'minor', 'latest']).default('patch'))
        .argument('[module...]', 'Modules to update')
        .action(update)

    try {
        await program.parseAsync(process.argv)
        exit({normal: true})
    } catch (error) {
        if (!['commander.helpDisplayed', 'commander.help', 'commander.version', 'commander.unknownOption', 'commander.unknownCommand', 'commander.invalidArgument'].includes(error.code)) {
            exit({error})
        }
    }
}

main().catch(log.error)
