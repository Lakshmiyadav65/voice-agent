/** Short human durations for call lengths and wait times: 42s, 3m 5s, 2h 10m. */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return mins < 60 ? `${mins}m ${seconds % 60}s` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
