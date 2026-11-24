"""Plain operation logs, with concise live sandbox feedback when given a heartbeat interval."""
import os
import re
import select
import signal
import sys
import time


CODES = re.compile(rb'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b')
INSTALLERS = {
    'gpu': 'GPU libraries', 'r_packages': 'R packages', 'dggrid': 'DGGRID',
    'gmt': 'GMT / GMTSAR', 'esa_snap_toolbox': 'ESA SNAP', 'orfeo': 'Orfeo Toolbox',
    'oft': 'Open Foris Toolkit', 'gcloud': 'Google Cloud CLI', 'node': 'Node.js',
    'python_packages': 'Python packages', 'azure_cli': 'Azure CLI', 'rstudio': 'RStudio',
    'shiny_server': 'Shiny Server', 'sepal_ui': 'SEPAL UI',
}


class SandboxProgress:
    def __init__(self, interval):
        self.interval = interval
        self.last_report = time.monotonic()
        self.active = None
        self.label = self.phase = ''
        self.phase_started = self.last_report
        self.clipped = set()

    def line(self, line):
        step = re.match(r'^#(\d+) \[.*\] RUN .*?init_([a-z_]+)\.sh', line)
        export = re.match(r'^#(\d+) exporting to image$', line)
        if step or export:
            self.active = (step or export)[1]
            self.label = INSTALLERS.get(step[2], step[2].replace('_', ' ').capitalize()) if step else 'exporting image layers'
            self.phase = ''
            self.phase_started = time.monotonic()
            self.emit(self.label + '...')
            return
        if self.active is None:
            return
        content = re.match(r'^#' + self.active + r' (\d+(?:\.\d+)? )?(.*)$', line)
        if not content:
            return
        text = content[2]
        done = re.fullmatch(r'DONE ([\d.]+)s', text)
        if content[1] is None and (text == 'CACHED' or done):
            self.emit(self.label + (' cached' if text == 'CACHED' else ' completed in ' + duration(float(done[1]))))
            self.active = None
            return
        if text.startswith('SEPAL_PROGRESS '):
            phase = text.removeprefix('SEPAL_PROGRESS ')
        else:
            source = re.match(r"\* installing \*source\* package ['‘]([^'’]+)['’]", text)
            phase = 'compiling ' + source[1] if source else None
        if phase is not None and phase != self.phase:
            # Counts advance within one phase, without resetting its elapsed time.
            if re.sub(r' \(\d+/\d+\)$', '', phase) != re.sub(r' \(\d+/\d+\)$', '', self.phase):
                self.phase_started = time.monotonic()
            self.phase = phase
            self.emit(self.activity())
        if 'output clipped, log limit' in text and self.active not in self.clipped:
            self.clipped.add(self.active)
            self.emit('WARNING: build output was clipped; diagnostics are incomplete')

    def heartbeat(self):
        if time.monotonic() - self.last_report >= self.interval:
            if self.active is not None:
                self.emit(self.activity() + ' (' + duration(time.monotonic() - self.phase_started) + ' elapsed)')
            else:
                self.emit('build running; waiting for the next installer or export step')

    def finish(self):
        if self.active is not None:
            self.emit('last active step: ' + self.activity())

    def activity(self):
        return self.label + (' — ' + self.phase if self.phase else '')

    def emit(self, message):
        write(2, ('sandbox: ' + message + '\n').encode())
        self.last_report = time.monotonic()


def main():
    progress = SandboxProgress(float(sys.argv[1])) if len(sys.argv) > 1 else None
    if progress:
        signal.signal(signal.SIGTERM, cancelled)
        signal.signal(signal.SIGINT, cancelled)
    rest, after_cr = b'', False
    try:
        while True:
            if progress:
                timeout = max(0, progress.interval - (time.monotonic() - progress.last_report))
                if not select.select([0], [], [], timeout)[0]:
                    progress.heartbeat()
                    continue
            chunk = os.read(0, 65536)
            if not chunk:
                break
            if after_cr and chunk.startswith(b'\n'):
                chunk = chunk[1:]
            *lines, rest = re.split(rb'\r\n|\r|\n', rest + chunk)
            after_cr = chunk.endswith(b'\r')
            for line in lines:
                plain = CODES.sub(b'', line)
                write(1, plain + b'\n')
                if progress:
                    progress.line(plain.decode('utf-8', errors='replace'))
            if progress:
                progress.heartbeat()
        if rest:
            plain = CODES.sub(b'', rest)
            write(1, plain + b'\n')
            if progress:
                progress.line(plain.decode('utf-8', errors='replace'))
    finally:
        if progress:
            progress.finish()


def write(fd, data):
    # A full disk can take only part of a write.
    while data:
        data = data[os.write(fd, data):]


def duration(seconds):
    seconds = round(seconds)
    return f'{seconds}s' if seconds < 60 else f'{seconds // 60}m {seconds % 60}s'


def cancelled(signum, _frame):
    raise SystemExit(128 + signum)


if __name__ == '__main__':
    try:
        main()
    except OSError as error:
        sys.exit(f'Cannot write the log: {error.strerror}')
