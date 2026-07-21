/**
 * Clock-as-prose — the continuity announcer's way of telling time.
 * "It is Friday, a quarter to eight."
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six',
                    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const MINUTE_WORDS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven',
  8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
  14: 'fourteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
  21: 'twenty-one', 22: 'twenty-two', 23: 'twenty-three', 24: 'twenty-four',
  26: 'twenty-six', 27: 'twenty-seven', 28: 'twenty-eight', 29: 'twenty-nine',
};

/** "a quarter to eight", "half past nine", "six o'clock", "eleven minutes past two" */
export function timeToProse(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const nextHour = (h + 1) % 24;
  const hourWord = HOUR_WORDS[h % 12];
  const nextHourWord = HOUR_WORDS[nextHour % 12];

  if (m === 0) return `${hourWord} o'clock`;
  if (m === 15) return `a quarter past ${hourWord}`;
  if (m === 30) return `half past ${hourWord}`;
  if (m === 45) return `a quarter to ${nextHourWord}`;
  if (m < 30) {
    const w = MINUTE_WORDS[m] ?? String(m);
    return m === 5 || m === 10 || m === 20 || m === 25
      ? `${w} past ${hourWord}`
      : `${w} minutes past ${hourWord}`;
  }
  const rem = 60 - m;
  const w = MINUTE_WORDS[rem] ?? String(rem);
  return rem === 5 || rem === 10 || rem === 20 || rem === 25
    ? `${w} to ${nextHourWord}`
    : `${w} minutes to ${nextHourWord}`;
}

/** "Good evening. It is Friday, a quarter to eight." */
export function greeting(d: Date): string {
  const h = d.getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}. It is ${DAYS[d.getDay()]}, ${timeToProse(d)}.`;
}

const COUNT_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];

export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}
