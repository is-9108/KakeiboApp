#!/usr/bin/env node
// シナリオと状態をファイルで共有する AWS CLI スタブ。実 AWS には接続しない。
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
const [service, operation] = args
const option = name => args[args.indexOf(name) + 1]
const statePath = process.env.FAKE_AWS_STATE
const state = JSON.parse(readFileSync(statePath, 'utf8'))
if (service === 'iam' && ['simulate-principal-policy', 'simulate-custom-policy'].includes(operation)) {
  const started = Date.now()
  const file = option('--cli-input-json').replace(/^file:\/\//, '')
  const input = JSON.parse(readFileSync(file, 'utf8'))
  // 最初の4ジョブを待ち合わせ、スケジューラ負荷に依存せず上限4を検査する。
  if (state.barrier && Number(file.split('/').at(-1).replace('.json','')) < state.barrier) {
    const arrivals = statePath + '.arrivals'
    appendFileSync(arrivals, process.pid + '\n')
    while (readFileSync(arrivals,'utf8').trim().split('\n').length < state.barrier) {
      if (Date.now() - started > 5000) { console.error('並列待ち合わせがタイムアウトしました'); process.exit(254) }
      await new Promise(resolve => setTimeout(resolve,10))
    }
    // 全員が到着した時刻より後に終了時刻を記録する。
    await new Promise(resolve => setTimeout(resolve,20))
  }
  if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay))
  const { statSync } = await import('node:fs')
  appendFileSync(process.env.FAKE_AWS_LOG, JSON.stringify({ service, operation, args, input, pager: process.env.AWS_PAGER, retryMode: process.env.AWS_RETRY_MODE, maxAttempts: process.env.AWS_MAX_ATTEMPTS, mode: statSync(file).mode, started, ended: Date.now() }) + '\n')
  if (state.fail === operation || state.failResource === input.ResourceArns[0]) { console.error(state.stderr ?? '模擬 API エラー'); process.exit(254) }
  if (state.response === 'nonJson') { console.log('JSON ではない応答'); process.exit(0) }
  if (state.expectedContext && JSON.stringify(input.ContextEntries) !== JSON.stringify(state.expectedContext)) { console.error('条件コンテキストが一致しません'); process.exit(254) }
  let EvaluationResults = input.ActionNames.map(action => {
    const resource = input.ResourceArns[0]
    const deny = (state.deny ?? []).find(d => d.action === action && (!d.resource || d.resource === resource))
    return { EvalActionName: action, EvalResourceName: resource, EvalDecision: deny?.decision ?? (deny || (state.denyUnresolved && resource.includes('PREFLIGHT-UNRESOLVED')) ? 'implicitDeny' : 'allowed'), MissingContextValues: deny?.missing ?? [] }
  })
  if (state.response === 'empty') EvaluationResults = []
  if (state.response === 'partial') EvaluationResults = EvaluationResults.slice(0,-1)
  if (state.response === 'invalid') EvaluationResults[0].EvalDecision = 'unknown'
  console.log(JSON.stringify(state.response === 'missing' ? {} : { EvaluationResults }))
  process.exit(0)
}
appendFileSync(process.env.FAKE_AWS_LOG, JSON.stringify({ service, operation, args, pager: process.env.AWS_PAGER }) + '\n')
const document = () => JSON.parse(readFileSync(option('--policy-document').replace(/^file:\/\//, ''), 'utf8'))
const name = args.includes('--policy-arn') ? option('--policy-arn').split('/').at(-1) : option('--policy-name')
const missing = () => { console.error('NoSuchEntity'); process.exit(254) }
let result = {}
const operationCalls = readFileSync(process.env.FAKE_AWS_LOG, 'utf8').trim().split('\n').map(JSON.parse).filter(c => c.operation === operation).length
if (state.fail === operation && operationCalls > (state.failAfter ?? 0)) { console.error('模擬 API エラー'); process.exit(254) }
if (service === 'sts') result = state.identity ?? { Account: '255737342820', Arn: 'arn:aws:iam::255737342820:user/admin' }
else if (service === 'accessanalyzer') result = { findings: state.findings?.[option('--policy-document').split('/').at(-1)] ?? [] }
else if (service === 'iam') {
  const policy = state.managed[name]
  switch (operation) {
    case 'get-policy':
      if (!policy) missing()
      result = { Policy: { DefaultVersionId: policy.default } }; break
    case 'get-policy-version':
      if (!policy) missing()
      result = { PolicyVersion: { Document: policy.versions.find(v => v.VersionId === option('--version-id')).Document } }; break
    case 'list-policy-versions': result = { Versions: policy.versions.map(v => ({ ...v, IsDefaultVersion: v.VersionId === policy.default })) }; break
    case 'delete-policy-version': policy.versions = policy.versions.filter(v => v.VersionId !== option('--version-id')); break
    case 'create-policy-version':
      if (!state.ignoreWrites) {
        const id = 'v' + (Math.max(...policy.versions.map(v => Number(v.VersionId.slice(1)))) + 1)
        policy.versions.push({ VersionId: id, CreateDate: '2026-11-13', Document: document() }); policy.default = id
      }
      break
    case 'create-policy':
      state.managed[name] = { default: 'v1', versions: [{ VersionId: 'v1', CreateDate: '2026-11-13', Document: document() }] }; break
    case 'list-attached-role-policies': result = { AttachedPolicies: state.attached.map(PolicyName => ({ PolicyName, PolicyArn: 'arn:aws:iam::255737342820:policy/' + PolicyName })) }; break
    case 'attach-role-policy': state.attached.push(name); break
    case 'get-role-policy':
      if (!state.inline[name]) missing()
      result = { PolicyDocument: state.inline[name] }; break
    case 'put-role-policy': if (!state.ignoreWrites) state.inline[name] = document(); break
    case 'list-role-policies': result = { PolicyNames: Object.keys(state.inline) }; break
    default: throw Error('未対応の操作: ' + operation)
  }
} else throw Error('未対応のサービス: ' + service)
writeFileSync(statePath, JSON.stringify(state))
console.log(JSON.stringify(result))
