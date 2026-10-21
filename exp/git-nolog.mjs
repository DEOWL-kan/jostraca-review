// 8. Case 6 with control.version=true, committing .jostraca/generated but git-ignoring only the meta log.
import { execSync as sh } from 'node:child_process'
import { rmSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { Jostraca, Project, File, Content } from 'jostraca'
const version = process.argv[2] === 'version'
const opts = { existing: { txt: { write: true, merge: true } }, control: { version } }
const gen = (folder, body) => Jostraca(opts).generate({ folder }, () => Project({}, () => File({ name: 'config.sh' }, () => Content(body))))
rmSync('./g', { recursive: true, force: true }); mkdirSync('./g/a', { recursive: true })
await gen('./g/a', 'PORT=8080\nHOST=localhost\n')
sh("git init -q && echo jostraca.meta.log > .jostraca/.gitignore && git add -A && git -c user.email=x@x -c user.name=x commit -qm gen", { cwd: './g/a' })
sh('git clone -q a b', { cwd: './g' })
appendFileSync('./g/b/config.sh', 'DEBUG=1  # hand edit\n')
await gen('./g/b', 'PORT=9090\nHOST=localhost\n')
console.log(`control.version=${version}; committed:`, sh('git ls-files', { cwd: './g/a' }).toString().trim().split('\n').join(', '))
console.log('after regenerate in fresh clone:\n' + readFileSync('./g/b/config.sh', 'utf8'))
