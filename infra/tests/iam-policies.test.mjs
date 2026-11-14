// 実ポリシーと危険な入力の両方で IAM の包含を検査する。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
const directory = new URL('../iam/policies/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.json'));
const policies = files.map(name => ({ name, document: JSON.parse(readFileSync(new URL(name, directory), 'utf8')) }));
const statements = policies.flatMap(({ document }) => document.Statement);
const array = value => Array.isArray(value) ? value : [value];
const role = 'arn:aws:iam::255737342820:role/kakeibo-github-deploy';
const policyArn = 'arn:aws:iam::255737342820:policy/kakeibo-github-deploy-core';
const matches = (pattern, value) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`, 'i').test(value);
const allows = (s, action, resource) => s.Effect === 'Allow' && array(s.Action).some(p => matches(p, action)) && array(s.Resource).some(p => matches(p, resource));
const fixture = (Action, Resource, Condition) => ({ Effect: 'Allow', Action, Resource, ...(Condition ? { Condition } : {}) });
function safeIam(s) {
  const write = array(s.Action).some(a => matches(a.split(':')[0], 'iam') && !/^iam:(Get|List)[A-Za-z*?]*$/i.test(a));
  return s.Effect !== 'Allow' || !write || array(s.Resource).every(r => !matches(r, role) && !['core', 's3', 'lambda', 'iam', 'edge', 'events'].some(n => matches(r, policyArn.replace(/core$/, n))));
}
const state = 'arn:aws:s3:::kakeibo-terraform-state-255737342820/kakeibo/terraform.tfstate';
const protectedObjects = ['arn:aws:s3:::kakeibo-receipts-255737342820-ap-northeast-1/receipts/x.jpg', 'arn:aws:s3:::kakeibo-terraform-state-255737342820/other'];
const forbidden = protectedObjects.flatMap(r => ['GetObject', 'GetObjectVersion', 'PutObject', 'DeleteObject'].map(a => ['s3:' + a, r]));
forbidden.push(...['s3:PutBucketPolicy', 's3:DeleteBucket'].map(a => [a, state.split('/kakeibo/')[0]]), ['s3:DeleteObject', state]);
const safeS3 = s => forbidden.every(([a, r]) => !allows(s, a, r));
const lambdaRoles = ['api', 'monthly', 'monthly-subscriptions', 'receipt-analysis'].map(n => `arn:aws:iam::255737342820:role/kakeibo-${n}-lambda`);
const schedulerRoles = ['monthly', 'monthly-subscriptions'].map(n => `arn:aws:iam::255737342820:role/kakeibo-${n}-scheduler`);
function safePass(s) {
  if (s.Effect !== 'Allow' || !array(s.Action).some(a => matches(a, 'iam:PassRole'))) return true;
  const services = array(s.Condition?.StringEquals?.['iam:PassedToService']);
  return services.length === 1 && array(s.Resource).every(r =>
    (services[0] === 'lambda.amazonaws.com' && lambdaRoles.includes(r)) ||
    (services[0] === 'scheduler.amazonaws.com' && schedulerRoles.includes(r)));
}
test('P1: JSON・Version・Sid・明示的 Action と Resource を検査する', () => {
  for (const { document } of policies) {
    assert.equal(document.Version, '2012-10-17'); assert.ok(Array.isArray(document.Statement));
    const ids = document.Statement.map(s => s.Sid); assert.equal(new Set(ids).size, ids.length);
    for (const s of document.Statement) { assert.ok(s.Sid); assert.ok(!('NotAction' in s)); assert.ok(!('NotResource' in s)); assert.ok(s.Action && s.Resource); }
  }
  assert.ok(matches('S3:Get*', 's3:GetObject')); assert.ok(matches('arn:*:kakeibo-?', 'ARN:aws:kakeibo-x')); assert.ok(!matches('s3:Get?', 's3:GetObject'));
});
test('P2: 管理8本以内・6144文字以内・インライン0本', () => {
  assert.ok(files.length > 0 && files.length <= 8);
  assert.equal(files.filter(n => n.endsWith('.inline.json')).length, 0);
  for (const { name, document } of policies) assert.ok([...JSON.stringify(document)].length <= 6144, name);
});
test('P3: プレースホルダーが残っていない', () => {
  for (const { document } of policies) assert.doesNotMatch(JSON.stringify(document), /[<>]/);
});
test('P4: 自身のロールと管理ポリシーの書き込みを許可せず2文で拒否する', () => {
  assert.ok(statements.every(safeIam));
  for (const r of ['*', role, role.replace('deploy', 'deplo?'), 'arn:aws:iam::255737342820:role/kakeibo-*'])
    for (const a of ['iam:PutRolePolicy', 'iam:*', 'iam:Put*', '*']) assert.equal(safeIam(fixture(a, r)), false);
  assert.equal(safeIam(fixture('iam:CreatePolicyVersion', 'arn:aws:iam::255737342820:policy/kakeibo-*')), false);
  assert.ok(safeIam(fixture('iam:Get*', role)));
  const denies = statements.filter(s => s.Effect === 'Deny');
  const roleWrites = ['CreateRole', 'DeleteRole', 'UpdateRole', 'UpdateAssumeRolePolicy', 'PutRolePolicy', 'DeleteRolePolicy', 'AttachRolePolicy', 'DetachRolePolicy', 'PassRole', 'TagRole', 'UntagRole', 'PutRolePermissionsBoundary', 'DeleteRolePermissionsBoundary'];
  for (const [r, actions] of [[role, roleWrites], [policyArn, ['CreatePolicyVersion', 'SetDefaultPolicyVersion', 'DeletePolicyVersion', 'DeletePolicy', 'CreatePolicy']]]) {
    assert.ok(denies.some(s => array(s.Resource).some(p => matches(p, r)) && actions.every(a => array(s.Action).some(p => matches(p, 'iam:' + a)))));
  }
  assert.ok(denies.filter(s => array(s.Resource).some(p => matches(p, role))).every(s => !array(s.Resource).some(p => matches(p, policyArn))));
});
test('P5: 全リソースは個別アクションのみ、書き込みワイルドカードは禁止', () => {
  for (const s of statements) for (const a of array(s.Action)) {
    if (array(s.Resource).includes('*')) { assert.doesNotMatch(a, /[*?]/); assert.equal(s.Sid, 'NoResourceLevelSupport'); }
    if (/[*?]/.test(a)) assert.match(a, /^[a-z0-9-]+:(Get|List|Describe)[A-Za-z]*\*$/i);
  }
});
test('P6: 具体的 ARN とアクションの照合で receipts と state を保護する', () => {
  assert.ok(statements.every(safeS3));
  for (const [a, r] of [['s3:Get*', 'arn:aws:s3:::kakeibo-*'], ['s3:GetObject', 'arn:aws:s3:::kakeibo-receipts-*/*'], ['s3:PutObject', 'arn:aws:s3:::kakeibo-receipts-*/*'], ['S3:GetObject', protectedObjects[0]]]) assert.equal(safeS3(fixture(a, r)), false);
  assert.ok(matches('arn:aws:s3:::kakeibo-*', protectedObjects[0]));
  for (const [r, actions] of [[state, ['GetObject', 'PutObject']], [state + '.tflock', ['GetObject', 'PutObject', 'DeleteObject']]])
    for (const a of actions) assert.ok(statements.some(s => allows(s, 's3:' + a, r)), `${a} ${r}`);
});
test('P7: README の構成表に全ファイルがある', () => {
  const readme = readFileSync(new URL('../iam/README.md', import.meta.url), 'utf8');
  for (const n of files) assert.ok(readme.split('\n').some(l => l.startsWith('|') && l.includes(n)), n);
});
test('P8: PassRole のサービスと6本のロールの対応を維持する', () => {
  assert.ok(statements.every(safePass));
  for (const [roles, service] of [[lambdaRoles, 'lambda.amazonaws.com'], [schedulerRoles, 'scheduler.amazonaws.com']])
    for (const r of roles) assert.ok(statements.some(s => allows(s, 'iam:PassRole', r) && safePass(s) && s.Condition.StringEquals['iam:PassedToService'] === service));
  assert.equal(safePass(fixture('iam:PassRole', lambdaRoles, { StringEquals: { 'iam:PassedToService': ['lambda.amazonaws.com', 'scheduler.amazonaws.com'] } })), false);
  assert.equal(safePass(fixture('IAM:PassRole', lambdaRoles, { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } })), false);
});
