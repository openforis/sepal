#!/usr/bin/node

import {program, Option} from 'commander'
import {showStatus, exit} from './utils.js'
import {build} from './build.js'
import {buildRestart} from './buildRestart.js'
import {start} from './start.js'
import {stop} from './stop.js'
import {restart} from './restart.js'
import {logs} from './logs.js'
import {shell} from './shell.js'
import {log} from './log.js'
import {npmUpdate} from './npm-update.js'
import {npmInstall} from './npm-install.js'

const main = async () => {
    process.on('SIGINT', () => exit({interrupted: true}))

    program.exitOverride()

    program
        .name('sepal')
        .description('CLI to manage SEPAL modules')
        .version('1.0.0')
    
    program.command('status')
        .description('Show modules status')
        .option('-d, --dependencies', 'Show dependencies too')
        .option('-x, --extended', 'Include health information')
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
    
    program.command('buildrestart')
        .description('Build and restart modules')
        .option('-nc, --no-cache', 'No cache')
        .option('-r, --recursive', 'Recursive')
        .option('-d, --dependencies', 'Restart dependencies')
        .option('-l, --log-tail', 'Show log tail')
        .option('-t, --log-tail', 'Show log tail')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to build')
        .action(buildRestart)
    
    program.command('stop')
        .description('Stop modules')
        .option('-d, --dependencies', 'Stop dependencies')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to stop')
        .action(stop)
    
    program.command('start')
        .description('Start modules')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .option('-l, --log-tail', 'Show log tail')
        .option('-t, --log-tail', 'Show log tail')
        .argument('[module...]', 'Modules to start')
        .action(start)
    
    program.command('restart')
        .description('Restart modules')
        .option('-d, --dependencies', 'Restart dependencies')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .option('-l, --log-tail', 'Show log tail')
        .option('-t, --log-tail', 'Show log tail')
        .argument('[module...]', 'Modules to start')
        .action(restart)
    
    program.command('logs')
        .description('Show module log')
        .option('-f, --follow', 'Follow')
        .option('-t, --tail', 'Tail (shortcut for --since 0 --follow)')
        .option('-s, --since <time>', 'Since relative or absolute time')
        .option('-u, --until <time>', 'Until relative or absolute time')
        .argument('[module...]', 'Modules')
        .action(logs)
    
    program.command('shell')
        .description('Start module shell')
        .option('-r, --root', 'Start as root')
        .argument('<module>', 'Module')
        .argument('[service]', 'Service')
        .action(shell)

    program.command('npm-update')
        .description('Update npm modules')
        .option('-u, --upgrade', 'Upgrade')
        .addOption(new Option('-t, --target <target>', 'Update target').choices(['patch', 'minor', 'latest']).default('latest'))
        .argument('[module...]', 'Modules to update')
        .action(npmUpdate)

    program.command('npm-install')
        .description('Install npm modules')
        .option('-v, --verbose', 'Verbose')
        .option('-c, --clean', 'Clean package-lock.json and node_modules')
        .argument('[module...]', 'Modules to install')
        .action(npmInstall)

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
