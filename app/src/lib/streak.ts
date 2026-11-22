// Practice streak from the dates of past sessions (local time).

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type StreakDay = { date: Date; label: string; practiced: boolean; isToday: boolean; isFuture: boolean };

/**
 * `current`: consecutive days with a date, ending today (or yesterday, so the streak
 * isn't lost before you've practised today). `week`: Monday to Sunday of this week.
 */
export function practiceStreak(dates: (string | Date)[], today = new Date()): { current: number; practicedToday: boolean; week: StreakDay[] } {
  const days = new Set(dates.map((d) => dayKey(new Date(d))));
  const practicedToday = days.has(dayKey(today));

  let current = 0;
  for (let d = practicedToday ? today : addDays(today, -1); days.has(dayKey(d)); d = addDays(d, -1)) current++;

  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      date,
      label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
      practiced: days.has(dayKey(date)),
      isToday: dayKey(date) === dayKey(today),
      isFuture: date > today && dayKey(date) !== dayKey(today),
    };
  });
  return { current, practicedToday, week };
}
