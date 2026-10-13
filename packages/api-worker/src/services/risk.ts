export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Flag {
  code: string;
  severity: Severity;
  message: string;
  points: number;
}

export function scoreFlags(flags: Flag[]) {
  const riskScore = Math.min(100, flags.reduce((acc, f) => acc + f.points, 0));
  const riskLevel = riskScore < 25 ? 'low' : riskScore < 50 ? 'medium' : riskScore < 75 ? 'high' : 'critical';
  return { riskScore, riskLevel };
}

export function concentrationFlags(top1: number, top10: number): Flag[] {
  const flags: Flag[] = [];
  if (top1 > 0.3) flags.push({ code: 'TOP_HOLDER_DOMINANT', severity: 'high', message: `Largest holder owns ${(top1 * 100).toFixed(1)}% of supply`, points: 20 });
  else if (top1 > 0.15) flags.push({ code: 'TOP_HOLDER_LARGE', severity: 'medium', message: `Largest holder owns ${(top1 * 100).toFixed(1)}% of supply`, points: 10 });
  if (top10 > 0.8) flags.push({ code: 'TOP10_CONCENTRATED', severity: 'high', message: `Top 10 holders own ${(top10 * 100).toFixed(1)}% of supply`, points: 20 });
  else if (top10 > 0.5) flags.push({ code: 'TOP10_ELEVATED', severity: 'medium', message: `Top 10 holders own ${(top10 * 100).toFixed(1)}% of supply`, points: 10 });
  return flags;
}
