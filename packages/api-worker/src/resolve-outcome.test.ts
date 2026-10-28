import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutcome } from './analytics';
import type { VerifiedPayment } from '@tollgate/core';

const simPayment: VerifiedPayment = {
  network: 'simulation',
  reference: 'sim_abc123',
  payer: null,
  amountUnits: 1000,
  settledAt: Date.now(),
};

const realPayment: VerifiedPayment = {
  network: 'base',
  reference: '0xdeadbeef',
  payer: '0x1234',
  amountUnits: 5000,
  settledAt: Date.now(),
};

describe('resolveOutcome', () => {
  it('402 → payment_required', () => {
    assert.equal(resolveOutcome(402, undefined, false), 'payment_required');
    assert.equal(resolveOutcome(402, realPayment, true), 'payment_required');
  });

  it('2xx + simulation payment → simulated', () => {
    assert.equal(resolveOutcome(200, simPayment, false), 'simulated');
  });

  it('2xx + real facilitator payment → paid', () => {
    assert.equal(resolveOutcome(200, realPayment, false), 'paid');
  });

  it('2xx + solana payment → paid', () => {
    const sol: VerifiedPayment = { ...realPayment, network: 'solana' };
    assert.equal(resolveOutcome(200, sol, false), 'paid');
  });

  it('2xx + polygon payment → paid', () => {
    const pol: VerifiedPayment = { ...realPayment, network: 'polygon' };
    assert.equal(resolveOutcome(200, pol, false), 'paid');
  });

  it('2xx + API key, no payment → api_key', () => {
    assert.equal(resolveOutcome(200, undefined, true), 'api_key');
  });

  it('2xx + no payment, no key → free', () => {
    assert.equal(resolveOutcome(200, undefined, false), 'free');
  });

  it('429 → rate_limited', () => {
    assert.equal(resolveOutcome(429, undefined, false), 'rate_limited');
  });

  it('4xx (not 402/429) → client_error', () => {
    assert.equal(resolveOutcome(400, undefined, false), 'client_error');
    assert.equal(resolveOutcome(404, undefined, false), 'client_error');
    assert.equal(resolveOutcome(403, undefined, false), 'client_error');
  });

  it('5xx → server_error', () => {
    assert.equal(resolveOutcome(500, undefined, false), 'server_error');
    assert.equal(resolveOutcome(503, undefined, false), 'server_error');
  });
});
