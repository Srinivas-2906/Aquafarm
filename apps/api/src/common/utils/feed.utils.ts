/** Group meals into feed slots by shared actualTime (same as feeding entry UI). */
export function groupMealsByFeedSlot<T extends { mealNumber: number; actualTime?: string | null }>(
  meals: T[],
): T[][] {
  const sorted = [...meals].sort((a, b) => a.mealNumber - b.mealNumber);
  const slots: T[][] = [];
  const timeToSlot = new Map<string, number>();

  for (const meal of sorted) {
    const time = meal.actualTime ?? '__default__';
    let slotIndex = timeToSlot.get(time);
    if (slotIndex === undefined) {
      slotIndex = slots.length;
      slots.push([]);
      timeToSlot.set(time, slotIndex);
    }
    slots[slotIndex].push(meal);
  }

  return slots;
}
