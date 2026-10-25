/**
 * Pakistan Tax Framework Calculation
 * Slabs:
 * 0 - 600,000: 0%
 * 600,001 - 1,200,000: 5% of excess over 600,000
 * 1,200,001 - 2,400,000: 30,000 + 15% of excess over 1,200,000
 * 2,400,001 - 3,600,000: 210,000 + 25% of excess over 2,400,000
 * Above 3,600,000: 510,000 + 35% of excess over 3,600,000
 */
export const calculateAnnualTax = (annualGross) => {
  if (annualGross <= 600000) {
    return 0;
  }
  if (annualGross <= 1200000) {
    return (annualGross - 600000) * 0.05;
  }
  if (annualGross <= 2400000) {
    return 30000 + (annualGross - 1200000) * 0.15;
  }
  if (annualGross <= 3600000) {
    return 210000 + (annualGross - 2400000) * 0.25;
  }
  return 510000 + (annualGross - 3600000) * 0.35;
};

export const calculatePayrollForEmployee = ({
  basicSalary = 0,
  totalWorkingDays = 22,
  absentDays = 0,
  unpaidLeaveDays = 0,
  halfDays = 0,
  eligibleWorkingDays = totalWorkingDays,
}) => {
  const basic = Number(basicSalary) || 0;
  const safeWorkingDays = totalWorkingDays > 0 ? totalWorkingDays : 22;
  const contractGross = Math.round(basic * 1.5);
  const factor = Math.max(0, Math.min(1, Number(eligibleWorkingDays) / safeWorkingDays));
  const earnedBasic = Math.round(basic * factor);
  const hra = Math.round(basic * 0.4 * factor);
  const medical = Math.round(basic * 0.1 * factor);
  const gross = Math.round(contractGross * factor);
  const dailyRate = Math.round((contractGross / safeWorkingDays) * 100) / 100;

  const totalDeductibleUnits = absentDays + unpaidLeaveDays + 0.5 * halfDays;
  const deductions = Math.round(dailyRate * totalDeductibleUnits * 100) / 100;

  const annualGross = contractGross * 12;
  const annualTax = Math.round(calculateAnnualTax(annualGross) * 100) / 100;
  const monthlyTax = Math.round((annualTax / 12) * factor * 100) / 100;

  const netPay = Math.max(0, Math.round((gross - deductions - monthlyTax) * 100) / 100);

  return {
    basic: earnedBasic,
    hra,
    medical,
    gross,
    contractGross,
    eligibleWorkingDays: Math.min(safeWorkingDays, Number(eligibleWorkingDays) || 0),
    dailyRate,
    absentDays,
    unpaidLeaveDays,
    halfDays,
    deductions,
    annualGross,
    annualTax,
    monthlyTax,
    netPay,
  };
};

