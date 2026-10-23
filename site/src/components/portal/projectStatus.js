export const taskGroups = {
  active: { label: 'In progress', values: ['in-progress', 'in_progress', 'doing'] },
  next: { label: 'Up next', values: ['todo', 'pending', 'not-started', 'not_started'] },
  done: { label: 'Completed', values: ['done', 'completed'] },
};
export function taskGroup(status) {
  return Object.keys(taskGroups).find(key => taskGroups[key].values.includes(status)) || 'other';
}
export function statusLabel(status, task = false) {
  const group = task && taskGroup(status);
  if (group && taskGroups[group]) return taskGroups[group].label;
  return status ? status.replace(/[-_]/g, ' ').replace(/^./, value => value.toUpperCase()) : 'Not set';
}
export function statusStyle(status, task = false) {
  const value = task ? taskGroup(status) : status;
  return ['active', 'in-progress', 'in_progress'].includes(value) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-secondary text-secondary-foreground';
}
export function displayDate(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function taskTotals(rows = []) {
  return rows.reduce((totals, row) => {
    totals.total += row.count;
    const key = taskGroup(row.status);
    totals[key] = (totals[key] || 0) + row.count;
    return totals;
  }, { total: 0, active: 0, next: 0, done: 0 });
}