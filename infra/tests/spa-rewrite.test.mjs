// CloudFront Function（SPA フォールバック）の挙動テスト。
// 実行: node --test infra/tests/spa-rewrite.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const here = path.dirname(fileURLToPath(import.meta.url))
const functionPath = path.join(here, '..', 'functions', 'spa-rewrite.js')
const functionCode = readFileSync(functionPath, 'utf8')

// CloudFront Functions の実行環境に合わせ、handler を素の JS として評価する。
const sandbox = {}
vm.runInNewContext(`${functionCode}\nthis.handler = handler;`, sandbox)
const handler = sandbox.handler

function rewrite(uri, querystring = {}) {
  return handler({ request: { uri, querystring } })
}

test('SPA: / と画面パスを index.html に書き換える', () => {
  for (const uri of ['/', '/login', '/entries', '/entries/2026/10', '/settings/']) {
    assert.equal(rewrite(uri).uri, '/index.html', uri)
  }
})

test('SPA: クエリー文字列は変更しない', () => {
  const querystring = { month: { value: '2026-10' } }
  const result = rewrite('/entries', querystring)
  assert.equal(result.uri, '/index.html')
  assert.deepEqual(result.querystring, querystring)
})

test('SPA: 拡張子のあるアセットは書き換えない', () => {
  for (const uri of ['/assets/index-DvrBnC50.js', '/favicon.ico', '/robots.txt', '/images/logo.png']) {
    assert.equal(rewrite(uri).uri, uri)
  }
})

test('SPA: /api と /health は書き換えない（防御的チェック）', () => {
  for (const uri of ['/api', '/api/', '/api/entries', '/api/entries/1', '/health']) {
    assert.equal(rewrite(uri).uri, uri)
  }
})
