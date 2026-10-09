# claude-code-mods

Seven mods for [Claude Code](https://claude.com/claude-code): a pet that grows while Claude works, live panes for agents and files, a boss fight against failing tests, a chime for long turns, and a model router. They work in any project and any language.

| Mod | What it does | Where | Command |
|---|---|---|---|
| **cute-feed** | A pet that hatches, grows and reacts to what Claude does, over a live emoji feed | pane | `/feed`, `/pat` |
| **dashboard** | Project, git, session cost, context, rate limits, subagents and recent activity | pane | `/dashboard` |
| **swarm** | Live tree of subagents: who spawned whom, what each is running right now | pane | `/swarm` |
| **repo-radar** | Map of the repo that lights up as files are read, edited or fail | pane | `/radar` |
| **boss-fight** | Failing lint, tests or typechecks spawn a boss; each fix damages it | above the prompt | `/boss` |
| **chime** | Sound + notification when a long turn finishes or Claude waits on you | sound | `/chime` |
| **model-router** | Sends routine prompts and read-only subagents to a cheaper model | status line | `/route` |

## Install

Requires a Claude Code build with mods (function hooks). In a terminal session, install any mod by name:

```
/plugin install cute-feed --marketplace rabanderlipe/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope = every project). Repeat with `dashboard`, `swarm`, `repo-radar`, `boss-fight`, `chime` or `model-router`.

Panes open as tabs beside the transcript. One the mod opens on its own needs a terminal at least 144 columns wide; its slash command opens it at any width.

## Settings

Every setting is a row in `/config`, or under `pluginConfigs.<mod>` in your settings.

**cute-feed**
- `autoOpen` (true) — open the pane when a session starts
- `petName` ("Mochi"), `species` ("cat") — for a brand-new pet: cat, chick, dog, slime, bunny, hamster, penguin, frog
- `dangerPatterns` ("") — extra `;`-separated regexes for commands that make the pet panic (it never blocks them)

**dashboard**
- `autoOpen` (false), `refreshSeconds` (5)

**swarm**
- `autoOpen` (true) — open when the first subagent starts

**repo-radar**
- `autoOpen` (false), `depth` (2) — folder levels always shown

**boss-fight**
- `enabledSuites` ("lint,unit,int,db,e2e,typecheck")
- `extraPatterns` ("") — your own commands, `suite=regex;suite=regex`, e.g. `unit=\bjust test\b;e2e=\bmake smoke\b`

Recognised out of the box: npm / pnpm / yarn / bun / make scripts (`test`, `test:int`, `e2e`, `lint`, `typecheck`, …), eslint, oxlint, biome, ruff, flake8, pylint, rubocop, golangci-lint, clippy, vitest, jest, mocha, ava, pytest, go test, cargo test, rspec, phpunit, dotnet test, mix test, pg_prove, playwright, cypress, tsc, vue-tsc, mypy, pyright, flow.

**chime**
- `thresholdSeconds` (45), `notify` (true), `waitingSound` (true)

**model-router**
- `lightModel` ("claude-haiku-5-5"), `standardModel` ("claude-sonnet-5-5")
- `maxMessages` (40) — past this, switching models costs a prompt-cache rebuild, so it stops routing
- `lightAgents` ("Explore,claude-code-guide,statusline-setup")
- `routeMainThread` (true), `routeSubagents` (true)

Prefix a prompt with `!haiku`, `!sonnet` or `!opus` to force a model for that turn.

## Using the pet

- It hatches from an egg after 3 turns, then grows baby → kid → teen → adult (level 7). The adult form depends on how it was raised: Golden, Chonk, Scholar, Gremlin, Shepherd, Owl, Hacker or Classic.
- It eats the lines Claude writes, gets hungry over time (also between sessions), gets sick after repeated failures, panics at destructive commands, gets stuffed as context fills up.
- Buttons in the pane: Pat ♥, Feed 🍙, Play 🎾. Commands: `/pat`, `/feed name <name>`, `/feed species <name>`, `/feed feed`.

## Develop

```
claude --plugin-dir plugins/cute-feed      # load one mod from disk, hot-reloaded on save
claude plugin validate plugins/cute-feed
claude plugin test plugins/cute-feed
```

Mods are not sandboxed: read the source before installing any mod, these included.

## License

MIT
