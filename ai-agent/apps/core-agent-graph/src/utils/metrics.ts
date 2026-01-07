type Stat = {
  success: number;
  error: number;
  durationMs: number;
  count: number;
};

const stats: Record<string, Stat> = {};

function getStat(capability: string): Stat {
  if (!stats[capability]) {
    stats[capability] = { success: 0, error: 0, durationMs: 0, count: 0 };
  }
  return stats[capability];
}

export function recordCapabilityMetric(capability: string, status: 'success' | 'error', durationMs: number): void {
  if (process.env.CORE_CAPABILITY_METRICS === '0') return;
  const stat = getStat(capability);
  if (status === 'success') {
    stat.success += 1;
  } else {
    stat.error += 1;
  }
  stat.count += 1;
  stat.durationMs += Math.max(0, durationMs);
}

export function getCapabilityMetrics(): Record<string, Stat> {
  return { ...stats };
}

export function getCapabilityMetricsWithDerived(): Record<
  string,
  Stat & { avgMs: number; errorRate: number }
> {
  const result: Record<string, Stat & { avgMs: number; errorRate: number }> = {};
  for (const [id, stat] of Object.entries(stats)) {
    const avgMs = stat.count ? stat.durationMs / stat.count : 0;
    const errorRate = stat.count ? stat.error / stat.count : 0;
    result[id] = { ...stat, avgMs, errorRate };
  }
  return result;
}

export function renderMetricsPrometheus(): string {
  const lines: string[] = [];
  lines.push('# HELP core_capability_invocations_total Total capability invocations by status.');
  lines.push('# TYPE core_capability_invocations_total counter');
  for (const [id, stat] of Object.entries(stats)) {
    lines.push(`core_capability_invocations_total{capability="${id}",status="success"} ${stat.success}`);
    lines.push(`core_capability_invocations_total{capability="${id}",status="error"} ${stat.error}`);
  }
  lines.push('# HELP core_capability_duration_ms_total Total execution time in milliseconds per capability.');
  lines.push('# TYPE core_capability_duration_ms_total counter');
  for (const [id, stat] of Object.entries(stats)) {
    lines.push(`core_capability_duration_ms_total{capability="${id}"} ${stat.durationMs}`);
  }
  lines.push('# HELP core_capability_avg_ms Average execution time in milliseconds per capability.');
  lines.push('# TYPE core_capability_avg_ms gauge');
  for (const [id, stat] of Object.entries(stats)) {
    const avg = stat.count ? stat.durationMs / stat.count : 0;
    lines.push(`core_capability_avg_ms{capability="${id}"} ${avg}`);
  }
  lines.push('# HELP core_capability_error_rate Error rate per capability (0-1).');
  lines.push('# TYPE core_capability_error_rate gauge');
  for (const [id, stat] of Object.entries(stats)) {
    const rate = stat.count ? stat.error / stat.count : 0;
    lines.push(`core_capability_error_rate{capability="${id}"} ${rate}`);
  }
  return lines.join('\n') + '\n';
}
