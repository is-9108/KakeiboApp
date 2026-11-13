// 一時ディレクトリと偽 AWS だけを使用する反映スクリプトの振る舞いテスト。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.resolve(here, '../iam/apply-policies.sh')
const doc = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 's3:ListBucket', Resource: '*' }] }
const old = { ...doc, Statement: [] }
const policy = (document = doc, count = 2) => ({
  default: 'v1', versions: Array.from({ length: count }, (_, i) => ({
    VersionId: 'v' + (i + 1), CreateDate: '2026-01-0' + (i + 1), Document: document,
  })),
})
const writes = new Set(['create-policy', 'create-policy-version', 'delete-policy-version', 'attach-role-policy', 'put-role-policy', 'detach-role-policy', 'delete-role-policy'])
function run(t, { files = { 'sample.json': doc }, state = {}, args = [], region = 'ap-northeast-1' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'iam-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'policies')); mkdirSync(path.join(dir, 'bin'))
  for (const [name, value] of Object.entries(files)) writeFileSync(path.join(dir, 'policies', name), typeof value === 'string' ? value : JSON.stringify(value))
  const stub = path.join(dir, 'bin/aws')
  writeFileSync(stub, readFileSync(path.join(here, 'fake-aws.mjs'))); chmodSync(stub, 0o755)
  // 再試行の回数はそのまま検査し、待機だけを省く。
  writeFileSync(path.join(dir, 'bin/sleep'), '#!/bin/sh\nexit 0\n'); chmodSync(path.join(dir, 'bin/sleep'), 0o755)
  const stateFile = path.join(dir, 'state.json'), log = path.join(dir, 'log')
  writeFileSync(stateFile, JSON.stringify({ managed: { sample: policy() }, inline: {}, attached: ['sample'], ...state }))
  writeFileSync(log, '')
  const result = spawnSync(script, ['--policies-dir', path.join(dir, 'policies'), ...args], {
    env: { ...process.env, AWS_REGION: region, PATH: path.join(dir, 'bin') + ':' + process.env.PATH, FAKE_AWS_STATE: stateFile, FAKE_AWS_LOG: log },
    encoding: 'utf8', timeout: 20000,
  })
  assert.ifError(result.error)
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  for (const c of calls) { assert.equal(c.pager, ''); assert.ok(c.args.includes('--output')); assert.equal(c.args[c.args.indexOf('--output') + 1], 'json') }
  return { ...result, calls, output: result.stdout + result.stderr, writes: calls.filter(c => writes.has(c.operation)) }
}
const finding = findingType => ({ findingType, issueCode: 'INVALID_ACTION', findingDetails: 'アクションを確認', locations: [{ path: [{ value: 'Statement' }] }] })
test('T1: ERROR は全件検証後に停止し他のポリシーにも書き込まない', t => {
  const r = run(t, { files: { 'sample.json': { ...doc, Statement: [{ Action: 's3:GetPublicAccessBlock' }] }, 'other.json': doc }, state: { findings: { 'sample.json': [finding('ERROR')] } } })
  assert.equal(r.status, 3); assert.match(r.stderr, /sample.json.*ERROR.*INVALID_ACTION.*アクションを確認.*Statement/); assert.equal(r.writes.length, 0)
  assert.equal(r.calls.filter(c => c.operation === 'validate-policy').length, 2)
})
test('T2: SECURITY_WARNING は書き込み前に停止する', t => {
  const r = run(t, { state: { findings: { 'sample.json': [finding('SECURITY_WARNING')] } } })
  assert.equal(r.status, 3); assert.equal(r.writes.length, 0)
})
test('T3: WARNING と SUGGESTION は表示して続行する', t => {
  const r = run(t, { state: { findings: { 'sample.json': [finding('WARNING'), finding('SUGGESTION')] } } })
  assert.equal(r.status, 0); assert.match(r.output, /WARNING/); assert.match(r.output, /SUGGESTION/)
})
test('T4: 相違する管理ポリシーは既定版を追加する', t => {
  const r = run(t, { state: { managed: { sample: policy(old) } } })
  assert.equal(r.status, 0); assert.deepEqual(r.writes.map(c => c.operation), ['create-policy-version']); assert.ok(r.writes[0].args.includes('--set-as-default'))
})
test('T5: 5版なら既定版以外の最古版を先に削除する', t => {
  const r = run(t, { state: { managed: { sample: policy(old, 5) } } })
  assert.equal(r.status, 0); assert.deepEqual(r.writes.map(c => c.operation), ['delete-policy-version', 'create-policy-version'])
  const a = r.writes[0].args; assert.equal(a[a.indexOf('--version-id') + 1], 'v2')
})
test('T6: キー順と空白の違いは無視し冪等に処理する', t => {
  const r = run(t, { files: { 'sample.json': { Statement: doc.Statement, Version: doc.Version } } })
  assert.equal(r.status, 0); assert.equal(r.writes.length, 0); assert.match(r.output, /変更なし/); assert.match(r.output, /差分なし/)
})
test('T7: 未作成なら作成してアタッチする', t => {
  const r = run(t, { state: { managed: {}, attached: [] } })
  assert.equal(r.status, 0); assert.deepEqual(r.writes.map(c => c.operation), ['create-policy', 'attach-role-policy'])
})
test('T8: インラインの差分を更新する', t => {
  const r = run(t, { files: { 'sample.inline.json': doc }, state: { managed: {}, attached: [], inline: { sample: old } } })
  assert.equal(r.status, 0); assert.deepEqual(r.writes.map(c => c.operation), ['put-role-policy'])
})
test('T9: 反映が見えなければ5回比較して差分を表示する', t => {
  const r = run(t, { state: { managed: { sample: policy(old) }, ignoreWrites: true } })
  assert.equal(r.status, 5); assert.match(r.output, /--- /); assert.match(r.output, /\+\+\+ /)
  assert.equal(r.calls.filter(c => c.operation === 'list-role-policies').length, 5)
})
test('T10: 余分なポリシーは報告し外さない', t => {
  const r = run(t, { args: ['--check'], state: { attached: ['sample', 'kakeibo-receipts-deploy'] } })
  assert.equal(r.status, 5); assert.match(r.output, /余分.*kakeibo-receipts-deploy/); assert.equal(r.writes.length, 0)
})
test('T11: check は一致・差分・不足とも書き込まない', t => {
  for (const [state, status] of [[{}, 0], [{ managed: { sample: policy(old) } }, 5], [{ attached: [] }, 5]]) {
    const r = run(t, { args: ['--check'], state }); assert.equal(r.status, status); assert.equal(r.writes.length, 0)
    if (state.attached) assert.match(r.output, /不足.*sample/)
  }
})
test('T12: validate-only は IAM と STS を呼ばない', t => {
  const r = run(t, { args: ['--validate-only'] }); assert.equal(r.status, 0)
  assert.deepEqual(r.calls.map(c => c.service), ['accessanalyzer'])
  assert.ok(r.calls[0].args.includes('IDENTITY_POLICY'))
})
test('T13: 管理ポリシー文字数の上限と警告境界を検査する', t => {
  for (const size of [6145, 6144, 4916]) {
    const value = { ...doc, padding: '' }; value.padding = 'a'.repeat(size - JSON.stringify(value).length)
    const r = run(t, { files: { 'sample.json': value }, args: ['--validate-only'] })
    assert.equal(r.status, size === 6145 ? 2 : 0)
    if (size === 6145) assert.equal(r.calls.length, 0)
    else assert.match(r.output, /警告/)
  }
})
test('T14: JSON構文・Version・Statementの不正は AWS 呼び出し前に停止する', t => {
  for (const value of ['{', { ...doc, Version: 'invalid' }, { ...doc, Statement: {} }]) {
    const r = run(t, { files: { 'sample.json': value } }); assert.equal(r.status, 2); assert.equal(r.calls.length, 0)
  }
})
test('T15: デプロイロールと別アカウントを拒否する', t => {
  for (const identity of [{ Account: '255737342820', Arn: 'arn:aws:sts::255737342820:assumed-role/kakeibo-github-deploy/run' }, { Account: '000000000000', Arn: 'admin' }]) {
    const r = run(t, { state: { identity } }); assert.equal(r.status, 1); assert.equal(r.writes.length, 0)
  }
})
test('T16: 反映失敗時は反映済みと未反映を表示する', t => {
  const r = run(t, { files: { 'a.json': doc, 'sample.json': doc }, state: { managed: { a: policy(), sample: policy(old) }, attached: ['a', 'sample'], fail: 'create-policy-version' } })
  assert.equal(r.status, 4); assert.match(r.output, /反映済み.*a/); assert.match(r.output, /未反映.*sample/)
})
test('T17: 未知引数・排他的引数・リージョン未指定を拒否する', t => {
  for (const options of [{ args: ['--unknown'] }, { args: ['--check', '--validate-only'] }, { region: '' }, { args: ['--policies-dir'] }]) {
    const r = run(t, options); assert.equal(r.status, 1); assert.equal(r.calls.length, 0)
  }
})
