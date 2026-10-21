# Jostraca can merge your hand edits. By default, it won't.

Jostraca is a code generator by Richard Rodger, and it is one of the libraries under the Voxgig SDK generator (`@voxgig/sdkgen` 4.34.5 depends on `jostraca >=0.38.1`). Its home page leads with "A code generator you can run twice." Most generators are project templates: they run once into an empty directory and are done. Jostraca targets the case after that, where generated code is committed, someone edits it by hand, and the generator has to run again.

My interest came from a previous task, where an SDK generator run replaced the `AGENTS.md` and `CLAUDE.md` I already had in the target directory, with no warning. So I tested the second-run promise directly, using jostraca 0.40.0 on Node 26.8.1 and macOS. All the scripts are short and linked at the end.

## What it gets right

A generator is a tree of ordinary function calls. A loop is `for`, a branch is `if`, and your debugger and type checker keep working:

```js
import { Jostraca, Project, File, Content } from 'jostraca'

const j = Jostraca({ existing: { txt: { merge: true } } })
await j.generate({ folder: './out' }, () => {
  Project({}, () => File({ name: 'config.sh' }, () => Content('PORT=8080\n')))
})
```

The callback runs first and writes nothing. Files are written in a second phase, once Jostraca knows the complete intended output, so it can decide per existing file whether to `write`, `preserve`, `present`, `diff` or `merge`. With `merge`, it keeps a copy of the last generated output in `.jostraca/generated/` and uses it as the base of a three-way merge. When I changed one line in the generator and appended another line by hand, both changes survived. When both sides changed the same line, I got git-style conflict markers instead of a guess:

```text
<<<<<<< GENERATED: 2026-10-21T10:06:03.726Z/merge
PORT=9090
=======
PORT=3000
>>>>>>> EXISTING: 2026-10-21T10:06:03.724Z/merge
```

The documentation is better than average for a project this size. Every example in it is executed by a test (`docs.test.ts`), and most of the failure cases below are written down somewhere in the reference or the how-to guides. My complaint is about what happens to a user who has not read those pages yet.

## Merge does not protect a file it has never generated

Merge needs a base. A file Jostraca has not generated before has none, so merge falls back to a plain overwrite. Jostraca treats a file as new when it has no base for it, even if the file already exists on disk:

```js
writeFileSync('out/AGENTS.md', '# My own agent notes\nDo not touch.\n')

const j = Jostraca({ existing: { txt: { write: true, merge: true } } })
const r = await j.generate({ folder: 'out' }, () =>
  Project({}, () => File({ name: 'AGENTS.md' }, () => Content('# Generated agent notes\n'))))

// out/AGENTS.md now contains only "# Generated agent notes"
// r.files: written 1, merged 0, conflicted 0, preserved 0
```

My notes are gone and no backup was kept. The result object reports one file written, which is accurate and easy to miss. The options reference documents this case ("no error, no warning"). The trouble is timing: the first run of a generator into an existing repository is when the most hand-written files sit next to its output. When there is no base, the fallback should be `present` (write `AGENTS.new.md` beside the original) or `preserve`. Today it is `write`.

## The merge base is git-ignored by default

On its first run Jostraca writes `.jostraca/.gitignore`, which excludes `generated` and the meta log, unless you set `control.version: true`. In a default setup, then, the merge base is never committed. I committed generated output, cloned the repository, made a hand edit in the clone, and regenerated there with `merge: true`:

```text
control.version=false; committed: .jostraca/.gitignore, config.sh
after regenerate in fresh clone:
PORT=9090
```

The hand edit (`DEBUG=1`) was overwritten. Merge works on the machine that first ran the generator and stops working for a teammate or a CI job, with no message, because a file the tool wrote itself excluded the state the merge depends on.

Setting `control.version: true` commits the base, and the merge then works in a clone. It also commits `jostraca.meta.log`, which records run timestamps. After a regenerate that produced identical output, `git status` showed the meta log modified, seven lines changed. The choice on offer is a merge that silently degrades on other machines, or a diff on every run. I assume the default `.gitignore` exists to avoid the second problem; it does so by creating the first.

One setup worked cleanly for me: `control.version: true` plus my own `.jostraca/.gitignore` containing only `jostraca.meta.log`. With that, a fresh clone merged a generator change and a hand edit without conflicts or noise.

## Failures are returned as data

A conflicted merge returns normally. The markers go into `config.sh`, which is now an invalid shell script, and its path is listed in `result.files.conflicted`. The how-to guide tells you to check that array and fail the run yourself. Git also writes markers into files, but `git merge` exits non-zero. A Jostraca generator wrapped in an npm script reports success.

Model substitution follows the same rule. A typo such as `$$app.nmae$$` for `$$app.name$$` stays in the output verbatim. The source comments say this is deliberate, so that an unresolved path is visible for debugging. It is visible to whoever opens the generated file, but nothing fails, so the typo can ship inside a `package.json`.

Neither behaviour is a bug. Together they mean that using Jostraca safely requires a wrapper that inspects the result object, and each user has to write that wrapper.

## Verdict

The central design, computing the full output tree before deciding what to do with each file, is sound, and it is what makes regeneration over edited code possible. The three-way merge did what it claimed in every case where it had a base. My objection is to the defaults: `write` unless you opt in, a merge that falls back to overwriting, a base excluded from version control, and results that never become exit codes. Each one is documented and defensible by itself. Combined, they let a user who read the home page and turned on `merge` lose hand edits in three separate ways.

These are the changes I would make, ordered by how much lost work each would prevent:

1. When merge has no base, fall back to `present` or `preserve`, and print the reason on stderr.
2. Move timestamps out of the committed metadata, so the base can be versioned by default without diff noise.
3. Add a `strict` option that throws on conflicts and on unresolved `$$paths$$`.

Until then I would use Jostraca for generators that fully own their output folder, and I would keep it away from directories containing files I wrote by hand.

*Tested with jostraca 0.40.0, Node 26.8.1, macOS. Experiment scripts: https://github.com/DEOWL-kan/jostraca-review/tree/main/exp*

## Reproduce

```bash
cd exp
npm ci
node run.mjs              # cases 1-5: default write, pre-existing file, conflict, lost base, $$path$$ typo
node git.mjs              # case 6: merge after a git clone, default control.version=false
node git.mjs version      # case 6 with control.version=true
node git-nolog.mjs version  # base committed, meta log ignored
node churn.mjs            # case 7: identical regenerate with control.version=true
```

Requires Node 20 or later and git. Each script writes into scratch folders under `exp/`.
