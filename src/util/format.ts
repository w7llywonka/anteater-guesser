export function fmtTime(ms: number, decimals = 2): string {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const totalS = ms / 1000;
  const m = Math.floor(totalS / 60);
  const s = totalS - m * 60;
  const sStr = s.toFixed(decimals);
  const body = m > 0 ? `${m}:${sStr.padStart(decimals ? decimals + 3 : 2, '0')}` : sStr;
  return neg ? `-${body}` : body;
}

export function fmtDist(m: number): string {
  if (m < 1) return '0 m';
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString()} km`;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
