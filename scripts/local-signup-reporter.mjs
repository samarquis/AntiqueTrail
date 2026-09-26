/* global process */
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeJourneyError } from './local-signup-contract.mjs'

export default class LocalSignupReporter {
  onBegin() {
    const input = JSON.parse(fs.readFileSync(process.env.LOCAL_SIGNUP_INPUT, 'utf8'))
    this.output = input.output
  }

  onTestEnd(_test, result) {
    fs.writeFileSync(
      path.join(this.output, 'browser-failure.json'),
      JSON.stringify({
        status: result.status,
        diagnostic: result.error ? sanitizeJourneyError(result.error.message) : '',
      }),
    )
  }
}
