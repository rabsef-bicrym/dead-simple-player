/** Local 12-hour clock, without a meridiem or a leading zero ("12:05"). */
export function clockShort(date: Date): string {
  const hour = date.getHours() % 12 || 12;
  return `${hour}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The cabinet's printed clock ("12:05 A.M."). */
export function clock12(date: Date): string {
  const meridiem = date.getHours() < 12 ? 'A.M.' : 'P.M.';
  return `${clockShort(date)} ${meridiem}`;
}
