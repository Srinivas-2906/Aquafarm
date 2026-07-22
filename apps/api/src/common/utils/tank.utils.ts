/** Strip leading # characters — tank code is stored/displayed without prefix. */
export function normalizeTankCode(code: string): string {
  return code.trim().replace(/^#+/, '');
}

export function compareTankCode(a: string, b: string): number {
  return normalizeTankCode(a).localeCompare(normalizeTankCode(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
