#!/usr/bin/env node
// Terraform plan の必要権限を IAM Policy Simulator で検証する。plan の内容は表示しない。
import { readFile, readdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const operations = ['create', 'read', 'update', 'delete']
const unresolved = 'PREFLIGHT-UNRESOLVED'
const attributes = new Set(['account','region','bucket','key','name','id','role','policy_arn','function_name','s3_bucket','s3_key','api_id','topic_arn','group_name','target.0.role_arn','secret_id'])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
class Failure extends Error { constructor(code, message) { super(message); this.code = code } }
function templateValid(template) {
  if (typeof template !== 'string' || !template) return false
  for (const [, key] of template.matchAll(/\{([^{}]+)\}/g)) if (!attributes.has(key)) return false
  return !/[{}]/.test(template.replace(/\{[^{}]+\}/g, ''))
}
export function validateManifest(manifest) {
  const bad = () => { throw new Failure(2, 'マニフェストの形式・アクション・プレースホルダーが不正です') }
  if (!object(manifest) || manifest.version !== 1 || !object(manifest.resourceTypes) || !Object.keys(manifest.resourceTypes).length) bad()
  for (const entry of Object.values(manifest.resourceTypes)) {
    if (!object(entry) || !templateValid(entry.arn)) bad()
    for (const op of operations) {
      if (!Array.isArray(entry[op])) bad()
      for (const item of entry[op]) {
        if (typeof item !== 'string' && !object(item)) bad()
        const spec = typeof item === 'string' ? { action: item } : item
        if (typeof spec.action !== 'string' || !/^[a-z0-9-]+:[A-Za-z0-9]+$/.test(spec.action)) bad()
        if (spec.arn !== undefined && !templateValid(spec.arn)) bad()
        if (spec.requires !== undefined && !attributes.has(spec.requires)) bad()
        if (spec.context !== undefined && (!object(spec.context) || Object.values(spec.context).some(v => !templateValid(v)))) bad()
      }
    }
  }
}
const get = (value, key) => key.split('.').reduce((v, k) => v?.[k], value)
const unknown = (value, key) => {
  let current = value
  for (const part of key.split('.')) { if (current === true) return true; current = current?.[part] }
  return current === true
}
const typeKey = r => (r.mode === 'data' ? 'data.' : '') + r.type
const plainAddress = address => address.replace(/\[(?:"(?:[^"\\]|\\.)*"|\d+)\]/g, '')
export function deriveRequests(plan, manifest, account, region) {
  validateManifest(manifest)
  const requests = new Map(), warnings = []
  const resources = new Map((plan.resource_changes ?? []).map(r => [r.address, r]))
  const config = new Map((plan.configuration?.root_module?.resources ?? []).map(r => [r.address, r]))
  for (const resource of plan.resource_changes ?? []) {
    const entry = manifest.resourceTypes[typeKey(resource)]
    const { change } = resource
    if (change.actions.join(',') === 'no-op' && !change.importing) continue
    if (!entry) { warnings.push(`マニフェスト未登録のリソースタイプ ${typeKey(resource)}（${resource.address}、${change.actions.join(',')}）。権限は検証していません。infra/iam/action-manifest.json に追加してください`); continue }
    const combos = []
    const afterOps = ops => ops.forEach(op => combos.push([op, 'after']))
    const actions = change.actions.join(',')
    switch (actions) {
      case 'no-op': if (change.importing) afterOps(['read']); break
      case 'read': afterOps(['read']); break
      case 'create': afterOps(['create','read','delete']); break
      case 'update': afterOps(['update','read']); break
      case 'delete': combos.push(['delete','before']); break
      case 'delete,create': case 'create,delete': afterOps(['create','read','delete']); combos.push(['delete','before']); break
      default: warnings.push(`未知の操作 ${actions}（${resource.address}）。権限は検証していません`)
    }
    for (const [op, side] of combos) {
      const value = key => {
        if (key === 'account') return account
        if (key === 'region') return region
        const found = get(change[side], key)
        if (!(side === 'after' && unknown(change.after_unknown, key)) && found !== null && found !== undefined && found !== '') return found
        if (side === 'after' && !resource.address.startsWith('module.')) {
          const refs = get(config.get(plainAddress(resource.address))?.expressions, key)?.references ?? []
          for (const ref of refs) {
            const match = /^((?:data\.)?\w+\.\w+(?:\[(?:"[^"\n]*"|\d+)\])?)\.(.+)$/.exec(ref)
            if (!match) continue
            const target = resources.get(match[1]), attr = match[2]
            if (!target) continue
            const direct = get(target.change.after, attr)
            if (!unknown(target.change.after_unknown, attr) && direct !== null && direct !== undefined && direct !== '') return direct
            const targetEntry = manifest.resourceTypes[typeKey(target)]
            // 非 ARN 参照は、利用側の ARN テンプレートに渡す確定名を復元する。
            if (attr !== 'arn' && targetEntry) {
              const nameKey = target.type === 'aws_iam_role' ? 'name' : target.type === 'aws_s3_bucket' ? 'bucket' : undefined
              const name = nameKey && get(target.change.after, nameKey)
              if (nameKey && !unknown(target.change.after_unknown, nameKey) && name !== null && name !== undefined && name !== '') return name
            }
            if (attr === 'arn' && targetEntry) return targetEntry.arn.replace(/\{([^{}]+)\}/g, (_, k) => {
              if (k === 'account') return account
              if (k === 'region') return region
              return unknown(target.change.after_unknown, k) ? unresolved : get(target.change.after, k) ?? unresolved
            })
          }
        }
        return unresolved
      }
      const expand = template => template.replace(/\{([^{}]+)\}/g, (_, key) => String(value(key)))
      for (const item of entry[op]) {
        const spec = typeof item === 'string' ? { action: item } : item
        if (spec.requires && !(side === 'after' && unknown(change.after_unknown, spec.requires))) {
          const required = get(change[side], spec.requires)
          if (required === null || required === undefined || required === '') continue
        }
        const arn = expand(spec.arn ?? entry.arn)
        const context = Object.entries(spec.context ?? {}).sort(([a],[b]) => a.localeCompare(b)).map(([key, template]) => ({ ContextKeyName: key, ContextKeyType: 'string', ContextKeyValues: [expand(template)] }))
        const key = JSON.stringify([spec.action, arn, context])
        if (!requests.has(key)) requests.set(key, { action: spec.action, arn, context, causes: [] })
        const causes = requests.get(key).causes
        if (!causes.some(c => c.address === resource.address && c.op === op)) causes.push({ address: resource.address, op })
      }
    }
  }
  return { requests: [...requests.values()], warnings }
}
const annotation = (kind, text) => console.log(`::${kind} title=IAM プリフライト::${String(text).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')}`)
async function jsonFile(file, code, message) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { throw new Failure(code, message) }
}
function validatePlan(plan) {
  if (!object(plan) || (plan.resource_changes !== undefined && !Array.isArray(plan.resource_changes))) throw new Failure(1, 'plan JSON の形式が不正です')
  for (const r of plan.resource_changes ?? []) {
    if (!object(r) || typeof r.address !== 'string' || typeof r.type !== 'string' || !object(r.change) || !Array.isArray(r.change.actions) || !r.change.actions.length || !r.change.actions.every(a => typeof a === 'string') || !['before','after','after_unknown'].every(k => r.change[k] == null || object(r.change[k]))) throw new Failure(1, 'plan JSON のリソース変更が不正です')
  }
  if (plan.configuration !== undefined && (!object(plan.configuration) || (plan.configuration.root_module?.resources !== undefined && !Array.isArray(plan.configuration.root_module.resources)))) throw new Failure(1, 'plan JSON の参照定義が不正です')
}
async function main() {
  const started = Date.now()
  const options = {}
  const names = ['--plan-json','--role-arn','--manifest','--custom-policies-dir']
  const args = process.argv.slice(2)
  for (let i=0; i<args.length; i+=2) {
    if (!names.includes(args[i]) || !args[i+1] || args[i+1].startsWith('--')) throw new Failure(1, '引数が不正です。--plan-json と --role-arn を指定してください')
    options[args[i]] = args[i+1]
  }
  const role = options['--role-arn'], region = process.env.AWS_REGION
  const mode = process.env.IAM_PREFLIGHT_MODE || 'enforce'
  if (!options['--plan-json'] || !/^arn:aws:iam::[0-9]{12}:role\/[\w+=,.@/-]+$/.test(role ?? '') || !region || !['warn','enforce'].includes(mode)) throw new Failure(1, 'plan パス・ロール ARN・AWS_REGION・IAM_PREFLIGHT_MODE を確認してください')
  const plan = await jsonFile(options['--plan-json'],1,'plan JSON を読み取れません（不在・読取不可・JSON 不正）')
  validatePlan(plan)
  const manifest = await jsonFile(options['--manifest'] ?? fileURLToPath(new URL('../iam/action-manifest.json',import.meta.url)),2,'マニフェストを読み取れません')
  const { requests, warnings } = deriveRequests(plan, manifest, role.split(':')[4], region)
  const available = await Promise.all((process.env.PATH ?? '').split(path.delimiter).map(async dir => { try { await access(path.join(dir,'aws'),constants.X_OK); return true } catch { return false } }))
  if (!available.some(Boolean)) throw new Failure(1,'aws CLI が見つかりません')
  let policyList
  if (options['--custom-policies-dir']) {
    try {
      const dir = options['--custom-policies-dir']
      const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort()
      if (!files.length) throw Error()
      policyList = await Promise.all(files.map(async file => { const text = await readFile(path.join(dir,file),'utf8'); JSON.parse(text); return text }))
    } catch { throw new Failure(1,'手動検証用ポリシーを読み取れません') }
  }
  const groups = new Map()
  for (const request of requests) {
    const key = JSON.stringify([request.arn,request.context])
    if (!groups.has(key)) groups.set(key,[])
    groups.get(key).push(request)
  }
  const jobs = [...groups.values()].flatMap(group => Array.from({length:Math.ceil(group.length/50)},(_,i) => group.slice(i*50,(i+1)*50)))
  const directory = await mkdtemp(path.join(tmpdir(),'kakeibo-preflight-'))
  const denials = [], errors = []
  let next = 0
  try {
    await Promise.all(Array.from({length:Math.min(4,jobs.length)}, async () => {
      while (next < jobs.length) {
        const index = next++, job = jobs[index], first = job[0]
        const input = { ...(policyList ? { PolicyInputList:policyList } : { PolicySourceArn:role }), ActionNames:job.map(r => r.action), ResourceArns:[first.arn], ContextEntries:first.context }
        const file = path.join(directory,`${index}.json`)
        await writeFile(file,JSON.stringify(input),{mode:0o600})
        try {
          const {stdout} = await exec('aws',['iam',policyList ? 'simulate-custom-policy' : 'simulate-principal-policy','--cli-input-json',`file://${file}`,'--output','json'],{env:{...process.env,AWS_PAGER:'',AWS_RETRY_MODE:'standard',AWS_MAX_ATTEMPTS:'5'},maxBuffer:8*1024*1024})
          let result
          try { result = JSON.parse(stdout) } catch { throw new Error('シミュレーションの応答が JSON ではありません') }
          if (!Array.isArray(result.EvaluationResults)) throw new Error('シミュレーションの応答形式が不正です')
          for (const request of job) {
            const evaluation = result.EvaluationResults.find(r => r.EvalActionName?.toLowerCase() === request.action.toLowerCase() && r.EvalResourceName === request.arn)
            if (!evaluation || !['allowed','implicitDeny','explicitDeny'].includes(evaluation.EvalDecision)) throw new Error('シミュレーションの評価結果が不足・不正です')
            if (evaluation.EvalDecision !== 'allowed') denials.push({request,evaluation})
          }
        } catch (error) {
          // CLI の stderr のみ許可する。JSON のパース例外や exec の引数は表示しない。
          errors.push(typeof error.stderr === 'string' ? error.stderr.trim() : 'シミュレーションの実行・応答に失敗しました')
        }
      }
    }))
  } finally { await rm(directory,{recursive:true,force:true}) }
  console.log(`IAM プリフライト: アクション ${requests.length} 件、ARN ${new Set(requests.map(r => r.arn)).size} 件、API 呼び出し ${jobs.length} 回、所要時間 ${((Date.now()-started)/1000).toFixed(2)} 秒`)
  for (const warning of warnings) annotation('warning',warning)
  if (mode === 'warn') annotation('warning','IAM_PREFLIGHT_MODE=warn: 権限不足・API 失敗を警告として扱います。一時回避後は設定を削除してください')
  const kind = mode === 'warn' ? 'warning' : 'error'
  for (const {request:r,evaluation:e} of denials) {
    const causes = r.causes.map(c => `${c.address} の ${c.op}`).join('、')
    annotation(kind,`${r.action} が ${e.EvalDecision}: ${r.arn}（${causes}）${JSON.stringify([r.arn,r.context]).includes(unresolved) ? ' 未確定 ID' : ''}${e.MissingContextValues?.length ? ' 条件不足: '+e.MissingContextValues.join(',') : ''}`)
  }
  if (denials.length) console.log('不足アクション: '+[...new Set(denials.map(d => d.request.action))].sort().join(', '))
  for (const error of errors) annotation(kind,`AWS API 失敗: ${error}`)
  return mode === 'warn' ? 0 : errors.length ? 4 : denials.length ? 3 : 0
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code }).catch(error => {
    annotation('error',error instanceof Failure ? error.message : 'プリフライトの入力・実行環境を確認してください')
    process.exitCode = error instanceof Failure ? error.code : 1
  })
}
