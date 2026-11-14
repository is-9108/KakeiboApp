// 合成 plan と偽 AWS によるプリフライトの検証。実 AWS には接続しない。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const manifestPath = path.join(root, 'infra/iam/action-manifest.json')
const script = path.join(root, 'infra/scripts/preflight-iam.mjs')
const role = 'arn:aws:iam::255737342820:role/kakeibo-github-deploy'
const manifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'))
test('T1・T3: マニフェストは4操作を持ち現行の全タイプを登録する', () => {
  const m = manifest()
  assert.equal(m.version, 1)
  for (const entry of Object.values(m.resourceTypes)) {
    assert.equal(typeof entry.arn, 'string')
    for (const op of ['create', 'read', 'update', 'delete']) {
      assert.ok(Array.isArray(entry[op]))
      for (const a of entry[op]) assert.match(typeof a === 'string' ? a : a.action, /^[a-z0-9-]+:[A-Za-z0-9]+$/)
    }
  }
  for (const f of readdirSync(path.join(root, 'infra')).filter(f => f.endsWith('.tf'))) {
    const text = readFileSync(path.join(root, 'infra', f), 'utf8')
    for (const [, mode, type] of text.matchAll(/\b(resource|data)\s+"([^"]+)"\s+"[^"]+"\s*\{/g))
      assert.ok(m.resourceTypes[(mode === 'data' ? 'data.' : '') + type], type)
  }
})
const change = (type, actions, after = {}, before = after, extra = {}) => ({ address: `${type}.api`, mode: 'managed', type, change: { actions, before, after, ...extra } })
const plan = (...resource_changes) => ({ resource_changes })
const bucket = { bucket: 'kakeibo-artifacts' }
function run(t, { input = plan(), state = {}, args = [], env = {}, customManifest, raw, missingAws = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'preflight-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  const stub = path.join(dir, 'bin/aws')
  if (!missingAws) { writeFileSync(stub, readFileSync(path.join(here, 'fake-aws.mjs'))); chmodSync(stub, 0o755) }
  const log = path.join(dir, 'calls'), stateFile = path.join(dir, 'state.json')
  writeFileSync(log, ''); writeFileSync(stateFile, JSON.stringify({ managed: {}, ...state }))
  const inputFile = path.join(dir, 'plan.json')
  writeFileSync(inputFile, raw ?? JSON.stringify(input))
  const cli = ['--plan-json', inputFile, '--role-arn', role]
  if (customManifest) {
    const file = path.join(dir, 'manifest.json'); writeFileSync(file, typeof customManifest === 'string' ? customManifest : JSON.stringify(customManifest)); cli.push('--manifest', file)
  }
  if (args.includes('--custom-policies-dir')) {
    const policies = path.join(dir, 'policies'); mkdirSync(policies)
    for (const f of ['a.json', 'b.json']) writeFileSync(path.join(policies, f), JSON.stringify({ Version: '2012-10-17', Statement: [] }))
    args = args.map(a => a === 'CUSTOM' ? policies : a)
  }
  const result = spawnSync(process.execPath, [script, ...cli, ...args], {
    env: { ...process.env, AWS_REGION: 'ap-northeast-1', IAM_PREFLIGHT_MODE: '', PATH: path.join(dir, 'bin') + (missingAws ? '' : ':' + process.env.PATH), FAKE_AWS_STATE: stateFile, FAKE_AWS_LOG: log, ...env }, encoding: 'utf8', timeout: 20000,
  })
  assert.ifError(result.error)
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  for (const c of calls) {
    assert.equal(c.pager, ''); assert.equal(c.retryMode, 'standard'); assert.equal(c.maxAttempts, '5')
    assert.equal(c.mode & 0o777, 0o600); assert.equal(c.args.at(-1), 'json')
    assert.throws(() => readFileSync(c.args[c.args.indexOf('--cli-input-json') + 1].slice(7)))
  }
  return { ...result, output: result.stdout + result.stderr, calls, requests: calls.flatMap(c => c.input.ActionNames.map(action => ({ action, arn: c.input.ResourceArns[0], context: c.input.ContextEntries }))) }
}
const simple = { version: 1, resourceTypes: { aws_example: { arn: 'arn:aws:example:{region}:{account}:{name}', create: ['example:Create'], read: ['example:Get'], update: ['example:Update'], delete: ['example:Delete'] } } }
const example = (actions, after = { name: 'new' }, before = { name: 'old' }, extra) => change('aws_example', actions, after, before, extra)
const actions = r => r.requests.map(r => r.action).sort()
test('T5〜T9: 操作ごとの必要アクションと新旧 ARN を導出する', t => {
  for (const [ops, expected] of [[['no-op'], []], [['create'], ['Create','Get','Delete']], [['update'], ['Update','Get']], [['delete'], ['Delete']], [['delete','create'], ['Create','Get','Delete','Delete']], [['create','delete'], ['Create','Get','Delete','Delete']]]) {
    const r = run(t, { customManifest: simple, input: plan(example(ops)) })
    assert.equal(r.status, 0, r.output); assert.deepEqual(actions(r), expected.map(a => 'example:'+a).sort())
    assert.equal(r.requests.filter(r => r.arn.endsWith(':old')).length, ops.includes('delete') ? 1 : 0)
  }
  const imported = run(t, { customManifest: simple, input: plan(example(['no-op'], undefined, undefined, { importing: { id: 'x' } })) })
  assert.deepEqual(actions(imported), ['example:Get'])
  for (const op of ['no-op', 'read']) {
    const r = run(t, { input: plan({ ...change('aws_caller_identity', [op]), mode: 'data' }) })
    assert.deepEqual(actions(r), op === 'read' ? ['sts:GetCallerIdentity'] : [])
  }
})
test('T8: S3 オブジェクト置き換えは新旧 key を評価し重複を除く', t => {
  const r = run(t, { input: plan(change('aws_s3_object', ['create','delete'], { ...bucket, key:'new.zip' }, { ...bucket, key:'old.zip' })) })
  assert.equal(r.status, 0, r.output)
  assert.ok(r.requests.some(r => r.action === 's3:DeleteObject' && r.arn.endsWith('/old.zip')))
  assert.equal(r.requests.filter(r => r.action === 's3:DeleteObject' && r.arn.endsWith('/new.zip')).length, 1)
})
const lambda = { function_name: 'kakeibo-api', role: 'arn:aws:iam::255737342820:role/kakeibo-api-lambda', s3_bucket: null, environment: [{ variables: { secret: 'SECRET-SHOULD-NOT-APPEAR' } }] }
test('T10・T12: 一段参照とインデックスを解決し PassRole の条件を渡す', t => {
  const resource = change('aws_lambda_function', ['create'], { ...lambda, role: null }, null, { after_unknown: { role: true } })
  resource.address = 'aws_lambda_function.api[0]'
  const input = { ...plan(resource, change('aws_iam_role', ['create'], { name: 'kakeibo-api-lambda', arn: null }, null, { after_unknown: { arn: true } })), configuration: { root_module: { resources: [{ address: 'aws_lambda_function.api', expressions: { role: { references: ['aws_iam_role.api.arn', 'aws_iam_role.api'] } } }] } } }
  const r = run(t, { input })
  assert.equal(r.status, 0, r.output)
  const pass = r.requests.find(r => r.action === 'iam:PassRole')
  assert.equal(pass.arn, lambda.role)
  assert.deepEqual(pass.context, [{ ContextKeyName: 'iam:PassedToService', ContextKeyType: 'string', ContextKeyValues: ['lambda.amazonaws.com'] }])
  assert.ok(!r.requests.some(r => r.action === 's3:GetObject'))
  assert.doesNotMatch(r.output, /SECRET-SHOULD-NOT-APPEAR/)
})
test('T10・T11: 解決不能・モジュールと新 CloudFront ID は未確定として評価する', t => {
  for (const address of ['aws_cloudfront_distribution.api', 'module.site.aws_cloudfront_distribution.api']) {
    const r = run(t, { input: plan({ ...change('aws_cloudfront_distribution', ['delete','create'], { id:null }, { id:'OLD' }, { after_unknown: { id: true } }), address }), state: { denyUnresolved: true } })
    assert.equal(r.status, 3, r.output); assert.match(r.output, /未確定 ID/); assert.match(r.output, /cloudfront:TagResource/)
    assert.ok(r.requests.some(r => r.arn.endsWith('/OLD')))
  }
})
test('T12: requires が未確定なら S3 読み取りも評価する', t => {
  const r = run(t, { input: plan(change('aws_lambda_function', ['update'], lambda, lambda, { after_unknown: { s3_bucket: true } })) })
  assert.equal(r.status, 0, r.output); assert.ok(r.requests.some(r => r.action === 's3:GetObject'))
})
test('T13・T17・T18: 未知の操作・タイプは警告し拒否があれば失敗する', t => {
  for (const deny of [false, true]) {
    const r = run(t, { customManifest: simple, input: plan(change('aws_sqs_queue', ['create']), example(['forget']), example(['update'])), state: { deny: deny ? [{ action: 'example:Update' }] : [] } })
    assert.equal(r.status, deny ? 3 : 0, r.output); assert.ok(r.stdout.startsWith('IAM プリフライト:'));  assert.match(r.output, /::warning.*aws_sqs_queue/); assert.match(r.output, /::warning.*forget/)
  }
})
test('T14〜T16・T26: 拒否・不足条件・API 失敗・warn を区別する', t => {
  for (const decision of ['implicitDeny', 'explicitDeny']) {
    const r = run(t, { input: plan(change('aws_lambda_function', ['update'], lambda)), state: { deny: [{ action: 'iam:PassRole', decision, missing: ['iam:PassedToService'] }] } })
    assert.equal(r.status, 3, r.output); assert.match(r.output, new RegExp(decision)); assert.match(r.output, /iam:PassedToService/); assert.match(r.output, /aws_lambda_function.api/)
  }
  const input = JSON.parse(readFileSync(path.join(here, 'fixtures/preflight/normal.json')))
  for (const mode of ['', 'enforce', 'warn']) for (const failure of ['deny', 'api']) {
    const r = run(t, { input, state: failure === 'api' ? { fail:'simulate-principal-policy' } : { deny: [{ action:'lambda:UpdateFunctionCode' }] }, env: { IAM_PREFLIGHT_MODE: mode } })
    assert.equal(r.status, mode === 'warn' ? 0 : failure === 'api' ? 4 : 3, r.output)
    assert.match(r.output, mode === 'warn' ? /::warning/ : /::error/)
    if (failure === 'deny') assert.match(r.output, /lambda:UpdateFunctionCode.*arn:aws:lambda.*aws_lambda_function.api/)
  }
})
test('T19: ARN・条件単位で50件ずつ分割し同時呼び出しは最大4件', t => {
  const m = structuredClone(simple)
  m.resourceTypes.aws_example.read = Array.from({length:101}, (_,i) => 'example:Get'+i)
  const input = plan(...Array.from({length:6}, (_,i) => ({ ...example(['read'], {name:'n'+i}), address:'aws_example.r'+i })))
  const r = run(t, { customManifest:m, input, state:{ delay:80 } })
  assert.equal(r.status, 0, r.output); assert.equal(r.calls.length, 18)
  assert.ok(r.calls.every(c => c.input.ActionNames.length <= 50))
  // 各子プロセスの開始と終了を記録し、実測した重なりを検査する。
  const events = r.calls.flatMap(c => [[c.started, 1], [c.ended, -1]]).sort((a,b) => a[0]-b[0] || a[1]-b[1])
  let active = 0, maximum = 0
  for (const [,delta] of events) { active += delta; maximum = Math.max(maximum, active) }
  assert.ok(maximum > 1 && maximum <= 4, String(maximum))
})
test('T2・T20: 入力不正は内容を漏らさず前提エラー1・マニフェスト不正2', t => {
  for (const options of [{ raw:'SECRET-SHOULD-NOT-APPEAR' }, { missingAws:true }, { input:[] }, { args:['--plan-json','/not-found'] }, { args:['--role-arn','bad'] }, { env:{AWS_REGION:''} }, { env:{IAM_PREFLIGHT_MODE:'invalid'} }, {args:['--unknown']}]) {
    const r = run(t, options); assert.equal(r.status, 1, r.output); assert.doesNotMatch(r.output, /SECRET-SHOULD-NOT-APPEAR/); assert.equal(r.calls.length,0)
  }
  for (const mutate of [m => m.resourceTypes.aws_example.read.push('example:*'), m => m.resourceTypes.aws_example.arn = '{unknown}', m => delete m.resourceTypes.aws_example.delete, m => m.version = 2]) {
    const m = structuredClone(simple); mutate(m)
    const r = run(t, { customManifest:m }); assert.equal(r.status,2,r.output); assert.equal(r.calls.length,0)
  }
  const invalid = run(t, {customManifest:'SECRET-SHOULD-NOT-APPEAR'})
  assert.equal(invalid.status,2); assert.doesNotMatch(invalid.output,/SECRET-SHOULD-NOT-APPEAR/)
  const r = spawnSync(process.execPath,[script],{encoding:'utf8'})
  assert.equal(r.status,1)
})
test('T21: 手動モードは全 JSON を custom simulator にだけ渡す', t => {
  const r = run(t, { customManifest:simple, input:plan(example(['update'])), args:['--custom-policies-dir','CUSTOM'] })
  assert.equal(r.status,0,r.output)
  assert.ok(r.calls.every(c => c.operation === 'simulate-custom-policy' && c.input.PolicyInputList.length === 2 && !('PolicySourceArn' in c.input)))
})
test('T25・T26: workflow は保存した plan を apply 前に検証し失敗を伝播する', () => {
  const workflow = readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8')
  const start = workflow.indexOf('- name: Terraform の plan を保存する')
  const end = workflow.indexOf('- name: 保存した同じ plan を適用して削除する')
  const step = workflow.slice(start,end)
  assert.match(step,/node infra\/scripts\/preflight-iam\.mjs/)
  assert.match(step,/terraform -chdir=infra show -json/)
  const preflight = step.slice(step.indexOf('- name: apply 前'))
  assert.match(preflight,/if: steps.latest.outputs.is_latest == 'true'/)
  assert.match(preflight,/--plan-json/); assert.match(preflight,/--role-arn/)
  assert.match(preflight,/IAM_PREFLIGHT_MODE: \$\{\{ vars.IAM_PREFLIGHT_MODE \}\}/)
  assert.match(preflight,/umask 077/); assert.match(preflight,/trap/)
  assert.match(preflight,/rm -f.*kakeibo.tfplan.json/)
  assert.match(preflight,/rm -f.*kakeibo.tfplan"/)
  assert.doesNotMatch(workflow.slice(start),/continue-on-error/)
})
test('T4: 全タイプの全操作は正本で許可され未確定の固定 ID だけ拒否される', async () => {
  const { deriveRequests } = await import('../scripts/preflight-iam.mjs')
  const m = manifest()
  const account = '255737342820', region = 'ap-northeast-1'
  const values = {
    bucket:'kakeibo-artifacts-255737342820-ap-northeast-1', key:'api/test.zip', name:'kakeibo-api', id:'known',
    role:lambda.role, function_name:'kakeibo-api', s3_bucket:'kakeibo-artifacts-255737342820-ap-northeast-1', s3_key:'api/test.zip',
    policy_arn:'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole', api_id:'wcc5e12yqf', topic_arn:'arn:aws:sns:ap-northeast-1:255737342820:kakeibo-monthly',
    group_name:'kakeibo-monthly', target:[{role_arn:'arn:aws:iam::255737342820:role/kakeibo-monthly-scheduler'}], secret_id:'arn:aws:secretsmanager:ap-northeast-1:255737342820:secret:kakeibo/database-mjboif',
  }
  const perType = {
    aws_s3_bucket_lifecycle_configuration:{bucket:'kakeibo-receipts-255737342820-ap-northeast-1'}, aws_s3_bucket_cors_configuration:{bucket:'kakeibo-receipts-255737342820-ap-northeast-1'}, aws_s3_bucket_notification:{bucket:'kakeibo-receipts-255737342820-ap-northeast-1'},
    aws_iam_role:{name:'kakeibo-api-lambda'}, aws_iam_role_policy:{role:'kakeibo-api-lambda'}, aws_iam_role_policy_attachment:{role:'kakeibo-api-lambda'},
    aws_cloudwatch_log_group:{name:'/aws/lambda/kakeibo-api'}, aws_cloudfront_distribution:{id:'E2UWQ35ESSQ4MT'},
    aws_cloudfront_origin_access_control:{id:'EFVP9LDI80ZZE'}, aws_apigatewayv2_api:{id:'wcc5e12yqf'},
  }
  const statements = readdirSync(path.join(root,'infra/iam/policies')).filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(readFileSync(path.join(root,'infra/iam/policies',f))).Statement)
  const array = v => Array.isArray(v) ? v : [v]
  const matches = (pattern,value) => new RegExp('^'+pattern.split('*').map(s => s.split('?').map(s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.')).join('.*')+'$','i').test(value)
  const applies = (s,r) => array(s.Action).some(a => matches(a,r.action)) && array(s.Resource).some(a => matches(a,r.arn)) && Object.entries(s.Condition ?? {}).every(([op,conditions]) => {
    assert.ok(['StringEquals','ArnEquals'].includes(op))
    return Object.entries(conditions).every(([key,expected]) => array(expected).includes(r.context.find(c => c.ContextKeyName === key)?.ContextKeyValues[0]))
  })
  const denied = r => statements.some(s => s.Effect === 'Deny' && applies(s,r)) || !statements.some(s => s.Effect === 'Allow' && applies(s,r))
  for (const type of Object.keys(m.resourceTypes)) {
    const data = type.startsWith('data.'), actual = type.replace(/^data\./,'')
    const known = {...values,...perType[type]}
    for (const actions of data ? [['read']] : [['create'],['update'],['delete']]) {
      const resource = { ...change(actual,actions,known),mode:data ? 'data':'managed' }
      const {requests} = deriveRequests(plan(resource),m,account,region)
      for (const r of requests) assert.equal(denied(r),false,`${type}: ${r.action} ${r.arn}`)
    }
  }
  // 新 ID に対する拒否だけを例外として明示する。既知 ID には上の許可検査を適用する。
  const exceptions = {
    aws_cloudfront_distribution:['TagResource','GetDistribution','GetDistributionConfig','ListTagsForResource','UpdateDistribution','DeleteDistribution'].map(a => 'cloudfront:'+a),
    aws_cloudfront_origin_access_control:['GetOriginAccessControl','GetOriginAccessControlConfig','DeleteOriginAccessControl'].map(a => 'cloudfront:'+a),
    aws_apigatewayv2_api:['apigateway:GET','apigateway:DELETE'],
    aws_apigatewayv2_integration:['apigateway:POST','apigateway:GET','apigateway:DELETE'],
    aws_apigatewayv2_route:['apigateway:POST','apigateway:GET','apigateway:DELETE'],
    aws_apigatewayv2_stage:['apigateway:POST','apigateway:GET','apigateway:DELETE'],
  }
  for (const [type,expected] of Object.entries(exceptions)) {
    const after = {...values,...perType[type],id:null,api_id:null}
    const resource = change(type,['create'],after,null,{after_unknown:{id:true,api_id:true}})
    const {requests} = deriveRequests(plan(resource),m,account,region)
    const actual = [...new Set(requests.filter(denied).map(r => r.action))].sort()
    assert.deepEqual(actual,expected.sort(),type)
    assert.ok(requests.filter(denied).every(r => r.arn.includes('PREFLIGHT-UNRESOLVED')))
  }
})
test('照合補足: API と stage のタグ変更・Lambda の待機読み取りを含める', () => {
  const m = manifest()
  for (const type of ['aws_apigatewayv2_api','aws_apigatewayv2_stage']) {
    for (const op of ['create','update']) assert.ok(m.resourceTypes[type][op].some(a => a.action === 'apigateway:POST' && a.arn.includes('/tags/')))
    assert.ok(m.resourceTypes[type].update.some(a => a.action === 'apigateway:DELETE' && a.arn.includes('/tags/')))
  }
  assert.ok(m.resourceTypes.aws_lambda_function.read.includes('lambda:GetFunctionConfiguration'))
})
test('照合補足: 削除後の待機で使う読み取りも delete に含める', () => {
  const r = manifest().resourceTypes
  for (const [type,action] of Object.entries({
    aws_s3_bucket:'s3:ListBucket', aws_s3_bucket_public_access_block:'s3:GetBucketPublicAccessBlock', aws_s3_bucket_ownership_controls:'s3:GetBucketOwnershipControls', aws_s3_bucket_cors_configuration:'s3:GetBucketCORS', aws_s3_bucket_policy:'s3:GetBucketPolicy', aws_iam_role:'iam:ListInstanceProfilesForRole', aws_lambda_function:'lambda:GetFunction', aws_lambda_permission:'lambda:GetPolicy', aws_cloudfront_distribution:'cloudfront:GetDistribution', aws_sns_topic_subscription:'sns:GetSubscriptionAttributes', aws_scheduler_schedule_group:'scheduler:GetScheduleGroup',
  })) assert.ok(r[type].delete.includes(action),type)
})
test('T10: 属性参照は一段だけ解決しモジュール内は未確定にする', t => {
  const base = change('aws_lambda_function',['create'],{...lambda,role:null,s3_bucket:null,s3_key:'code.zip'},null,{after_unknown:{role:true,s3_bucket:true}})
  const roleResource = change('aws_iam_role',['create'],{name:'kakeibo-api-lambda',arn:null},null,{after_unknown:{arn:true}})
  const bucketResource = change('aws_s3_bucket',['create'],{bucket:'kakeibo-artifacts-255737342820-ap-northeast-1'})
  const configuration = {root_module:{resources:[{address:'aws_lambda_function.api',expressions:{role:{references:['aws_iam_role.api.arn']},s3_bucket:{references:['aws_s3_bucket.api.bucket']}}}]}}
  const r = run(t,{input:{...plan(base,roleResource,bucketResource),configuration}})
  assert.equal(r.status,0,r.output)
  assert.ok(r.requests.some(r => r.action === 's3:GetObject' && r.arn.endsWith('kakeibo-artifacts-255737342820-ap-northeast-1/code.zip')))
  const moduleResource = {...base,address:'module.api.aws_lambda_function.api'}
  const moduleResult = run(t,{input:{...plan(moduleResource,roleResource),configuration},state:{denyUnresolved:true}})
  assert.equal(moduleResult.status,3,moduleResult.output); assert.match(moduleResult.output,/iam:PassRole.*未確定 ID/)
  const unknownRole = {...roleResource,change:{...roleResource.change,after:{name:null},after_unknown:{name:true,arn:true}}}
  const chained = {...configuration,root_module:{resources:[...configuration.root_module.resources,{address:'aws_iam_role.api',expressions:{name:{references:['aws_s3_bucket.api.bucket']}}}]}}
  const result = run(t,{input:{...plan(base,unknownRole,bucketResource),configuration:chained},state:{denyUnresolved:true}})
  assert.equal(result.status,3,result.output); assert.match(result.output,/iam:PassRole.*PREFLIGHT-UNRESOLVED/)
})
test('条件の異なる要求を分離し同一要求は要因を保持して重複排除する', t => {
  const m = structuredClone(simple)
  m.resourceTypes.aws_example.update = [{action:'example:Update',context:{'iam:PassedToService':'lambda.amazonaws.com'}},{action:'example:Update',context:{'iam:PassedToService':'scheduler.amazonaws.com'}}]
  const input = plan(example(['update']),{...example(['update']),address:'aws_example.other'})
  const r = run(t,{customManifest:m,input,state:{deny:[{action:'example:Update'}]}})
  assert.equal(r.status,3,r.output)
  assert.equal(r.calls.length,3)
  assert.equal(r.requests.length,3)
  assert.match(r.output,/aws_example.api の update、aws_example.other の update/)
})
