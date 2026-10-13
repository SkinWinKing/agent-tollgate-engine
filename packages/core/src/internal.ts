import type { VerifyResult } from './types';

export const VerifyResultFail = (reason: string, retryable: boolean): VerifyResult => ({ ok: false, reason, retryable });
