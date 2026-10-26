import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTrend, TrendEvidence, TREND_SWITCH_THRESHOLD } from './trend'

const ev = (outcome: 'BIGGER' | 'SMALLER', weight = 1): TrendEvidence => ({ outcome, weight })

test('threshold is 3', () => {
  assert.equal(TREND_SWITCH_THRESHOLD, 3)
})

test('no evidence -> no trend', () => {
  const t = analyzeTrend([])
  assert.equal(t.direction, null)
  assert.equal(t.segment.length, 0)
  assert.equal(t.switches, 0)
})

test('first result sets the trend', () => {
  const t = analyzeTrend([ev('SMALLER')])
  assert.equal(t.direction, 'SMALLER')
  assert.equal(t.pendingOpposite, 0)
})

test('one or two opposite results do not switch the trend', () => {
  const t = analyzeTrend([ev('BIGGER'), ev('BIGGER'), ev('SMALLER'), ev('SMALLER')])
  assert.equal(t.direction, 'BIGGER')
  assert.equal(t.pendingOpposite, 2)
  assert.equal(t.switches, 0)
  assert.equal(t.segment.length, 4)
})

test('three consecutive opposite results switch the trend', () => {
  const t = analyzeTrend([ev('BIGGER'), ev('BIGGER'), ev('SMALLER'), ev('SMALLER'), ev('SMALLER')])
  assert.equal(t.direction, 'SMALLER')
  assert.equal(t.switches, 1)
  assert.equal(t.pendingOpposite, 0)
  assert.deepEqual(t.segment.map(e => e.outcome), ['SMALLER', 'SMALLER', 'SMALLER'])
})

test('a confirming result resets the pending-opposite count', () => {
  const t = analyzeTrend([ev('BIGGER'), ev('SMALLER'), ev('SMALLER'), ev('BIGGER'), ev('SMALLER'), ev('SMALLER')])
  assert.equal(t.direction, 'BIGGER')
  assert.equal(t.switches, 0)
  assert.equal(t.pendingOpposite, 2)
})

test('multiple switches are counted', () => {
  const t = analyzeTrend([
    ev('BIGGER'),
    ev('SMALLER'), ev('SMALLER'), ev('SMALLER'),
    ev('BIGGER'), ev('BIGGER'), ev('BIGGER'),
  ])
  assert.equal(t.direction, 'BIGGER')
  assert.equal(t.switches, 2)
})

test('support is the weighted share of the current segment agreeing with the trend', () => {
  const t = analyzeTrend([ev('BIGGER', 1), ev('BIGGER', 0.6), ev('SMALLER', 0.6)])
  assert.equal(t.direction, 'BIGGER')
  assert.ok(Math.abs(t.support - (1.6 / 2.2) * 100) < 1e-9)
})
