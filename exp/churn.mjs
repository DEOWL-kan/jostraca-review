// 7. With control.version=true, does an identical regenerate still change committed files?
import { execSync as sh } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'
import { Jostraca, Project, File, Content } from 'jostraca'
const gen = () => Jostraca({ existing: { txt: { merge: true } }, control: { version: true } })
  .generate({ folder: './c' }, () => Project({}, () => File({ name: 'config.sh' }, () => Content('PORT=8080\n'))))
rmSync('./c', { recursive: true, force: true }); mkdirSync('./c')
await gen()
sh('git init -q && git add -A && git -c user.email=x@x -c user.name=x commit -qm gen', { cwd: './c' })
await new Promise(r => setTimeout(r, 1100))
await gen()
console.log('git status after identical regenerate:\n' + sh('git status --short', { cwd: './c' }).toString())
console.log(sh('git diff --stat', { cwd: './c' }).toString())
