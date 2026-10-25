/**
 * HCM Date Utilities
 * Handles working days calculation skipping weekends (Sat & Sun) and configured public holidays.
 */

export const formatDateString = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isWeekend = (date) => {
  const day = new Date(date).getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
};

/**
 * Calculates number of working days between two YYYY-MM-DD dates inclusive.
 * Skips Saturdays, Sundays, and dates matching holidaySet.
 */
export const calculateWorkingDays = (startDateStr, endDateStr, holidayDateStrings = []) => {
  const holidaySet = new Set(holidayDateStrings.map((d) => String(d).split('T')[0]));
  
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (start > end) {
    return 0;
  }

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const formatted = formatDateString(current);
    const dayOfWeek = current.getDay();

    const isSatOrSun = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidaySet.has(formatted);

    if (!isSatOrSun && !isHoliday) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
};

/**
 * Returns total working days in a month (YYYY-MM), skipping weekends and holidays.
 */
export const getWorkingDaysInMonth = (yearMonthStr, holidayDateStrings = []) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  return calculateWorkingDays(
    formatDateString(startDate),
    formatDateString(endDate),
    holidayDateStrings
  );
};

