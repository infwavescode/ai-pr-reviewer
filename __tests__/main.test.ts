import {expect, test} from '@jest/globals'
import * as cp from 'child_process'
import * as path from 'path'
import * as process from 'process'

test('test runs', () => {
  process.env['INPUT_ACTION'] = 'code-review'
  process.env['GITHUB_ACTION'] = 'test'
  process.env['GITHUB_TOKEN'] = 'test-token'
  process.env['GITHUB_REPOSITORY'] = 'test-owner/test-repo'
  process.env['GITHUB_EVENT_NAME'] = 'push'
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})
