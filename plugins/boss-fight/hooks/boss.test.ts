import { expect, test } from 'claude-code/testing'

import { applyRun, classify, failures, isFailedRun, parseConfig } from './boss'

test('classifies JavaScript package scripts across runners', () => {
  expect(classify('npm run lint')).toBe('lint')
  expect(classify('npm test')).toBe('unit')
  expect(classify('pnpm --filter web test')).toBe('unit')
  expect(classify('pnpm --filter web test:int')).toBe('int')
  expect(classify('yarn test:integration')).toBe('int')
  expect(classify('bun run e2e')).toBe('e2e')
  expect(classify('pnpm db:test')).toBe('db')
  expect(classify('npm run typecheck')).toBe('typecheck')
  expect(classify('yarn check-types')).toBe('typecheck')
  expect(classify('make lint')).toBe('lint')
})

test('classifies tools called directly in several ecosystems', () => {
  expect(classify('npx eslint .')).toBe('lint')
  expect(classify('pnpm exec oxlint .')).toBe('lint')
  expect(classify('ruff check src')).toBe('lint')
  expect(classify('cargo clippy -- -D warnings')).toBe('lint')
  expect(classify('golangci-lint run')).toBe('lint')
  expect(classify('npx vitest run')).toBe('unit')
  expect(classify('uv run pytest -q')).toBe('unit')
  expect(classify('pytest tests/integration')).toBe('int')
  expect(classify('go test ./...')).toBe('unit')
  expect(classify('go test -tags integration ./...')).toBe('int')
  expect(classify('cargo test')).toBe('unit')
  expect(classify('bundle exec rspec')).toBe('unit')
  expect(classify('npx playwright test')).toBe('e2e')
  expect(classify('npx cypress run')).toBe('e2e')
  expect(classify('supabase test db')).toBe('db')
  expect(classify('npx tsc --noEmit')).toBe('typecheck')
  expect(classify('poetry run mypy .')).toBe('typecheck')
  expect(classify('pyright')).toBe('typecheck')
})

test('ignores watch modes and unrelated commands', () => {
  expect(classify('git status')).toBe(null)
  expect(classify('npm install')).toBe(null)
  expect(classify('ruff format .')).toBe(null)
  expect(classify('pnpm test:watch')).toBe(null)
  expect(classify('npx vitest --watch')).toBe(null)
  expect(classify('tsc -w')).toBe(null)
  expect(classify('jest --watch')).toBe(null)
})

test('parses failure counts per tool family', () => {
  expect(failures('unit', ' Test Files  2 failed | 10 passed\n      Tests  5 failed | 80 passed')).toBe(5)
  expect(failures('unit', 'Tests:       3 failed, 10 passed, 13 total')).toBe(3)
  expect(failures('unit', '===== 2 failed, 8 passed in 0.31s =====')).toBe(2)
  expect(failures('unit', '--- FAIL: TestA (0.00s)\n--- FAIL: TestB (0.00s)\nFAIL')).toBe(2)
  expect(failures('unit', 'test result: FAILED. 7 passed; 4 failed; 0 ignored')).toBe(4)
  expect(failures('unit', '  12 passing\n  2 failing')).toBe(2)
  expect(failures('unit', '10 examples, 3 failures')).toBe(3)
  expect(failures('e2e', '  3 failed\n  12 passed')).toBe(3)
  expect(failures('db', 'ok 1 - a\nnot ok 2 - b\nnot ok 3 - c')).toBe(2)
  expect(failures('lint', '✖ 9 problems (6 errors, 3 warnings)')).toBe(6)
  expect(failures('lint', 'Found 4 warnings and 7 errors.')).toBe(7)
  expect(failures('lint', 'Found 5 errors.\n[*] 2 fixable')).toBe(5)
  expect(failures('typecheck', 'a.ts(1,1): error TS2345: x\nb.ts(2,2): error TS2339: y')).toBe(2)
  expect(failures('typecheck', 'Found 8 errors in 3 files (checked 20 source files)')).toBe(8)
  expect(failures('unit', 'something broke')).toBe(undefined)
  expect(failures('unit', '0 failed')).toBe(undefined)
})

test('userConfig adds patterns first and filters suites', () => {
  const config = parseConfig({ extraPatterns: 'unit=\\bjust test\\b;e2e=make smoke;bogus=x;lint=([', enabledSuites: 'unit,e2e' })
  expect(config.extra).toHaveLength(2)
  expect(classify('just test', config)).toBe('unit')
  expect(classify('make smoke', config)).toBe('e2e')
  expect(classify('npm run lint', config)).toBe(null)
  expect(classify('npm test', config)).toBe('unit')
})

test('a failing run is spotted by isError or the exit code', () => {
  expect(isFailedRun({ isError: true })).toBe(true)
  expect(isFailedRun({ text: 'boom\nExit code 1' })).toBe(true)
  expect(isFailedRun({ text: 'all good' })).toBe(false)
})

test('lifecycle: spawn, hit, heal, block, KO', () => {
  const spawned = applyRun([], 'unit', true, 5, 0)
  expect(spawned.kind).toBe('spawn')
  expect(spawned.bosses[0]).toEqual(expect.objectContaining({ name: 'Test Slime', hp: 5, maxHp: 5 }))

  const hit = applyRun(spawned.bosses, 'unit', true, 2, 1000)
  expect(hit.kind).toBe('hit')
  expect(hit.bosses[0]?.hp).toBe(2)

  const healed = applyRun(hit.bosses, 'unit', true, 4, 2000)
  expect(healed.kind).toBe('heal')
  expect(healed.bosses[0]?.hp).toBe(4)

  expect(applyRun(healed.bosses, 'unit', true, undefined, 3000).kind).toBe('block')

  const ko = applyRun(healed.bosses, 'unit', false, 0, 5 * 60000)
  expect(ko.kind).toBe('ko')
  expect(ko.bosses).toHaveLength(0)
  if (ko.kind === 'ko') {
    expect(ko.minutes).toBe(5)
    expect(ko.hits).toBe(2)
  }

  expect(applyRun([], 'lint', false, 0, 0).kind).toBe('none')
  expect(applyRun([], 'lint', true, undefined, 0).bosses[0]?.hp).toBe(3)
})
