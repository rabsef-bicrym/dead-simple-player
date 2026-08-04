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
      : `${w} ${m === 1 ? 'minute' : 'minutes'} past ${hourWord}`;
  }
  const rem = 60 - m;
  const w = MINUTE_WORDS[rem] ?? String(rem);
  return rem === 5 || rem === 10 || rem === 20 || rem === 25
    ? `${w} to ${nextHourWord}`
    : `${w} ${rem === 1 ? 'minute' : 'minutes'} to ${nextHourWord}`;
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

const ORDINALS: Record<number, string> = {
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth',
  7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh',
  12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
  16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth',
  20: 'twentieth', 21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third',
  24: 'twenty-fourth', 25: 'twenty-fifth', 26: 'twenty-sixth',
  27: 'twenty-seventh', 28: 'twenty-eighth', 29: 'twenty-ninth',
  30: 'thirtieth', 31: 'thirty-first',
};

/** "Friday, the twenty-fourth of July" */
export function dateProse(d: Date): string {
  return `${DAYS[d.getDay()]}, the ${ORDINALS[d.getDate()] ?? String(d.getDate())} of ${MONTHS[d.getMonth()]}`;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
              'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
              'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–99 in words; beyond that, digits keep their dignity. */
export function numberWords(n: number): string {
  if (n < 0 || n > 99 || !Number.isInteger(n)) return String(n);
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

/** "fourteen minutes", "two hours", "one hour and ten minutes" */
export function durationProse(startOrMins: Date | number, stop?: Date): string {
  const mins = typeof startOrMins === 'number'
    ? startOrMins
    : Math.round((stop!.getTime() - startOrMins.getTime()) / 60000);
  if (mins < 1) return 'under a minute';
  if (mins === 1) return 'one minute';
  if (mins < 60) return `${numberWords(mins)} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = h === 1 ? 'one hour' : `${numberWords(h)} hours`;
  if (m === 0) return hours;
  return `${hours} and ${m === 1 ? 'one minute' : `${numberWords(m)} minutes`}`;
}
