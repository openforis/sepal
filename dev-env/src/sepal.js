#!/usr/bin/node

import {Option, program} from 'commander'

import {build} from './build.js'
import {buildRestart} from './buildRestart.js'
import {eslint} from './eslint.js'
import {log} from './log.js'
import {logs} from './logs.js'
import {npmAudit} from './npm-audit.js'
import {npmInstall} from './npm-install.js'
import {npmTest} from './npm-test.js'
import {npmUpdate} from './npm-update.js'
import {restart} from './restart.js'
import {shell} from './shell.js'
import {start} from './start.js'
import {stop} from './stop.js'
import {tail} from './tail.js'
import {exit, showStatus} from './utils.js'

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
        .option('--bd, --build-dependencies', 'Show build dependencies')
        .option('--dd, --direct-dependencies', 'Show direct dependencies')
        .option('--id, --inverse-dependencies', 'Show inverse dependencies')
        .argument('[module...]', 'Modules to show')
        .action(showStatus)
    
    program.command('build')
        .description('Build modules')
        .option('--nc, --no-cache', 'No cache')
        .option('-r, --recursive', 'Recursive')
        .option('-q, --quiet', 'Quiet')
        .option('-v, --verbose', 'Verbose')
        .argument('[module...]', 'Modules to build')
        .action(build)
    
    program.command('buildrestart')
        .description('Build and restart modules')
        .option('--nc, --no-cache', 'No cache')
        .option('--recursive', 'Recursive')
        .option('-d, --dependencies', 'Restart dependencies')
        .option('-l, --log', 'Show log')
        .option('-f, --log-follow', 'Full log and log')
        .option('-p, --production', 'Start in production mode, when supported by the module')
        .option('-r, --log-recent', 'Recent log and follow')
        .option('-t, --log-tail', 'Log tail only')
        .option('-s, --sequential', 'Sequential start')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .argument('[module...]', 'Modules to build')
        .action(buildRestart)
    
    program.command('stop')
        .description('Stop modules')
        .option('-d, --dependencies', 'Stop dependencies')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .option('-s, --sequential', 'Sequential stop')
        .argument('[module...]', 'Modules to stop')
        .action(stop)
    
    program.command('start')
        .description('Start modules')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .option('-l, --log', 'Show log')
        .option('-f, --log-follow', 'Full log and log')
        .option('-p, --production', 'Start in production mode, when supported by the module')
        .option('-r, --log-recent', 'Recent log and follow')
        .option('-t, --log-tail', 'Log tail only')
        .option('-s, --sequential', 'Sequential start')
        .argument('[module...]', 'Modules to start')
        .action(start)

    program.command('restart')
        .description('Restart modules')
        .option('-d, --dependencies', 'Restart dependencies')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .option('-l, --log', 'Show log')
        .option('-f, --log-follow', 'Full log and log')
        .option('-p, --production', 'Start in production mode, when supported by the module')
        .option('-r, --log-recent', 'Recent log and follow')
        .option('-t, --log-tail', 'Log tail only')
        .option('-s, --sequential', 'Sequential start')
        .argument('[module...]', 'Modules to start')
        .action(restart)
    
    program.command('logs')
        .description('Show module log')
        .option('-l, --log', 'Show low (no-op, for consistency)')
        .option('-f, --follow', 'Follow')
        .option('-r, --recent', 'Last 20 lines and follow')
        .option('-t, --tail', 'Tail (shortcut for --follow --since 0)')
        .option('-s, --since <time>', 'Since relative or absolute time')
        .option('-u, --until <time>', 'Until relative or absolute time')
        .argument('[module...]', 'Modules')
        .action(logs)
    
    program.command('tail')
        .description('Show multi-module log tail')
        .option('-f, --follow', 'Follow')
        .option('-r, --recent', 'Last 20 lines and follow')
        .option('-t, --tail', 'Tail (shortcut for --follow --since 0)')
        .option('-s, --since <time>', 'Since relative or absolute time')
        .option('-u, --until <time>', 'Until relative or absolute time')
        .option('-m, --merge', 'Merge all streams into a single one')
        .argument('[module...]', 'Modules')
        .action(tail)
    
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
        .option('-s, --sequential', 'Sequential install')
        .argument('[module...]', 'Modules to install')
        .action(npmInstall)

    program.command('npm-audit')
        .description('Audit npm modules')
        .option('-f, --fix', 'Fix')
        .argument('[module...]', 'Modules to audit')
        .action(npmAudit)

    program.command('npm-test')
        .description('Run npm interactive tests')
        .argument('module', 'Module to test')
        .argument('[testArgs...]', 'Arguments to pass to npm test')
        .allowUnknownOption(true)
        .action(npmTest)

    program.command('eslint')
        .description('Run eslint')
        .argument('[module...]', 'Modules to eslint')
        .option('-f, --fix', 'Fix autofixable ESLint errors.')
        .action(eslint)

    try {
        await program.parseAsync(process.argv)
        exit({normal: true})
    } catch (error) {
        if (!['commander.helpDisplayed', 'commander.help', 'commander.version', 'commander.unknownOption', 'commander.unknownCommand', 'commander.invalidArgument', 'commander.missingArgument'].includes(error.code)) {
            exit({error})
        }
    }
}

main().catch(log.error)
