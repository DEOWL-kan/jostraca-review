// Jostraca 0.40.0 experiments for the task-2 review. Each case runs in a fresh dir.
import { rmSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs'
import { Jostraca, Project, File, Content } from 'jostraca'

const fresh = (d) => { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); return d }
const show = (title, path) => console.log(`\n--- ${title}: ${path}\n${readFileSync(path, 'utf8')}`)
const gen = (j, folder, name, body) =>
  j.generate({ folder }, () => Project({}, () => File({ name }, () => Content(body))))

// 1. Default options: hand edit, then regenerate.
{
  const d = fresh('./out1')
  const j = Jostraca()
  await gen(j, d, 'config.sh', 'PORT=8080\n')
  appendFileSync(`${d}/config.sh`, 'DEBUG=1  # hand edit\n')
  await gen(j, d, 'config.sh', 'PORT=9090\n')
  show('1 default, after regenerate', `${d}/config.sh`)
}

// 2. merge:true, but the file existed (hand-written) before the first generate.
{
  const d = fresh('./out2')
  writeFileSync(`${d}/AGENTS.md`, '# My own agent notes\nDo not touch.\n')
  const j = Jostraca({ existing: { txt: { write: true, merge: true } } })
  const r = await gen(j, d, 'AGENTS.md', '# Generated agent notes\n')
  show('2 merge on pre-existing hand-written file', `${d}/AGENTS.md`)
  console.log('result.files keys/lengths:', JSON.stringify(Object.fromEntries(Object.entries(r.files || {}).map(([k, v]) => [k, v.length]))))
}

// 3. merge:true, both sides edit the same line.
{
  const d = fresh('./out3')
  const j = Jostraca({ existing: { txt: { write: true, merge: true } } })
  await gen(j, d, 'config.sh', 'PORT=8080\nHOST=localhost\n')
  writeFileSync(`${d}/config.sh`, 'PORT=3000\nHOST=localhost\n')
  const r = await gen(j, d, 'config.sh', 'PORT=9090\nHOST=localhost\n')
  show('3 conflict', `${d}/config.sh`)
  console.log('conflicted:', JSON.stringify(r.files?.conflicted), '| run threw: no')
}

// 4. merge:true, baseline folder lost (e.g. .jostraca/ was gitignored, fresh clone).
{
  const d = fresh('./out4')
  const j = Jostraca({ existing: { txt: { write: true, merge: true } } })
  await gen(j, d, 'config.sh', 'PORT=8080\n')
  console.log('\n--- 4 baseline dir exists after first run:', existsSync(`${d}/.jostraca`))
  rmSync(`${d}/.jostraca`, { recursive: true, force: true })
  appendFileSync(`${d}/config.sh`, 'DEBUG=1  # hand edit\n')
  await gen(j, d, 'config.sh', 'PORT=9090\n')
  show('4 merge without baseline', `${d}/config.sh`)
}

// 5. Typo in a model path.
{
  const d = fresh('./out5')
  const j = Jostraca({ model: { app: { name: 'acme' } } })
  try {
    await gen(j, d, 'pkg.json', '{ "name": "$$app.nmae$$" }\n')
    show('5 typo in $$path$$', `${d}/pkg.json`)
  } catch (e) { console.log('\n--- 5 typo threw:', e.message.split('\n')[0]) }
}
