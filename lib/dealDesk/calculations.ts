export interface DealCalcInputs {
  asking_price: number;
  deferred_maintenance: number;
  avionics_upgrade_budget: number;
  paint_interior_budget: number;
  ferry_flight_cost: number;
  hold_period_months: number;
  title_escrow_fees: number;
  target_profit_dollars: number;
  estimated_resale_price: number;
}

export interface LegacyNegotiationRow {
  discount: number;
  offer_price: number;
  profit: number;
  profit_percent: number;
}

export interface DealCalcOutputs {
  insurance_estimate: number;
  total_cost: number;
  profit_at_ask: number;
  profit_percent_at_ask: number;
  max_offer_price: number;
  negotiation_table: LegacyNegotiationRow[];
}

export interface AcquisitionItem {
  id: string;
  label: string;
  amount: number;
  category: "prebuy" | "closing" | "airworthiness" | "paperwork";
}

export interface UpgradeItem {
  id: string;
  label: string;
  amount: number;
  type: "must_do" | "value_add";
  category: "avionics" | "interior" | "paint" | "engine" | "prop" | "mod";
}

export interface FlipCalcInputs {
  purchase_price: number;
  resale_base: number;
  resale_low: number;
  resale_stretch: number;
  hold_months: number;
  planned_hours_flown: number;
  acquisition_items: AcquisitionItem[];
  upgrade_items: UpgradeItem[];
  hangar_monthly: number;
  insurance_annual_premium: number;
  subscriptions_monthly: number;
  annual_inspection_reserve_monthly: number;
  admin_overhead_monthly: number;
  fuel_gph: number;
  fuel_price_per_gallon: number;
  oil_cost_per_hour: number;
  engine_reserve_per_hour: number;
  prop_reserve_per_hour: number;
  misc_maintenance_per_hour: number;
  financing_enabled: boolean;
  loan_amount: number;
  interest_rate_pct: number;
  loan_term_years: number;
  loan_origination_fees: number;
  opportunity_cost_rate_pct: number;
  insurance_hull_value: number;
  insurance_deductible_pct: number;
  broker_commission_pct: number;
  exit_escrow_fees: number;
  presale_spruce_up: number;
  buyer_squawk_contingency_pct: number;
  exit_sales_tax_pct: number;
  days_to_sell_slow: number;
  maintenance_contingency_pct: number;
  target_profit_dollars: number;
}

export interface SectionTotals {
  acquisition_capex: number;
  must_do_upgrades: number;
  value_add_upgrades: number;
  all_in_basis: number;
  fixed_carrying_total: number;
  variable_operating_total: number;
  insurance_monthly: number;
  financing_cost_over_hold: number;
  exit_costs_total: number;
}

export interface ScenarioOutput {
  resale_price: number;
  hold_months: number;
  net_proceeds: number;
  total_cash_out: number;
  net_profit: number;
  roi_pct: number;
  annualized_roi_pct: number;
  cash_on_cash_return: number;
}

export interface SensitivityCell {
  sale_price_pct: number;
  days_to_sell: number;
  net_profit: number;
  roi_pct: number;
  annualized_roi_pct: number;
}

export interface NegotiationRow {
  discount: number;
  offer_price: number;
  net_profit_base: number;
  roi_pct_base: number;
}

export interface FlipCalcOutputs {
  section_totals: SectionTotals;
  base: ScenarioOutput;
  low: ScenarioOutput;
  stretch: ScenarioOutput;
  slow_sale: ScenarioOutput;
  sensitivity_grid: SensitivityCell[];
  breakeven_sale_price: number;
  max_purchase_price_for_target: number;
  monthly_burn_rate: number;
  value_add_roi: number;
  negotiation_table: NegotiationRow[];
}

const DISCOUNTS = [0, 2000, 5000, 8000, 10000, 15000];

function safe(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampMin(value: number, min = 0): number {
  return Math.max(min, safe(value));
}

function sum(items: number[]): number {
  return items.reduce((total, current) => total + current, 0);
}

function computeFinancingCost(
  financingEnabled: boolean,
  loanAmount: number,
  interestRatePct: number,
  loanTermYears: number,
  holdMonths: number,
  loanOriginationFees: number
): number {
  if (!financingEnabled) return 0;
  const principal = clampMin(loanAmount);
  const hold = clampMin(holdMonths);
  const termMonths = Math.max(1, Math.round(clampMin(loanTermYears, 1) * 12));
  const monthlyRate = clampMin(interestRatePct) / 100 / 12;
  if (principal <= 0 || hold <= 0) return clampMin(loanOriginationFees);

  let monthlyPayment = 0;
  if (monthlyRate === 0) {
    monthlyPayment = principal / termMonths;
  } else {
    const growth = Math.pow(1 + monthlyRate, termMonths);
    monthlyPayment = (principal * monthlyRate * growth) / (growth - 1);
  }

  let remainingPrincipal = principal;
  let principalPaid = 0;
  const paidMonths = Math.min(termMonths, Math.round(hold));
  for (let i = 0; i < paidMonths; i += 1) {
    const interestPortion = remainingPrincipal * monthlyRate;
    const principalPortion = Math.min(remainingPrincipal, monthlyPayment - interestPortion);
    principalPaid += Math.max(0, principalPortion);
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion);
    if (remainingPrincipal <= 0) break;
  }

  const totalPayments = monthlyPayment * paidMonths;
  const interestOverHold = Math.max(0, totalPayments - principalPaid);
  return interestOverHold + clampMin(loanOriginationFees);
}

function annualizedRoi(roiPct: number, holdMonths: number): number {
  const hold = Math.max(0.0001, holdMonths);
  return (Math.pow(1 + roiPct / 100, 12 / hold) - 1) * 100;
}

function buildScenario(
  resalePrice: number,
  holdMonths: number,
  allInBasis: number,
  fixedMonthly: number,
  variablePerHour: number,
  plannedHoursBase: number,
  baseHoldMonths: number,
  financingCost: (hold: number) => number,
  brokerCommissionPct: number,
  exitEscrowFees: number,
  presaleSpruceUp: number,
  buyerSquawkContingencyPct: number,
  exitSalesTaxPct: number
): ScenarioOutput {
  const hold = Math.max(0, holdMonths);
  const hoursScale = baseHoldMonths > 0 ? hold / baseHoldMonths : 1;
  const scenarioHours = Math.max(0, plannedHoursBase * hoursScale);
  const variableTotal = variablePerHour * scenarioHours;
  const fixedCarryingTotal = fixedMonthly * hold;
  const financingOverHold = financingCost(hold);
  const exitCosts =
    resalePrice * (brokerCommissionPct / 100) +
    clampMin(exitEscrowFees) +
    clampMin(presaleSpruceUp) +
    allInBasis * (buyerSquawkContingencyPct / 100) +
    resalePrice * (exitSalesTaxPct / 100);
  const netProceeds = resalePrice - exitCosts;
  const totalCashOut = allInBasis + fixedCarryingTotal + variableTotal + financingOverHold;
  const netProfit = netProceeds - totalCashOut;
  const roiPct = totalCashOut > 0 ? (netProfit / totalCashOut) * 100 : 0;
  return {
    resale_price: resalePrice,
    hold_months: hold,
    net_proceeds: netProceeds,
    total_cash_out: totalCashOut,
    net_profit: netProfit,
    roi_pct: roiPct,
    annualized_roi_pct: annualizedRoi(roiPct, hold),
    cash_on_cash_return: roiPct,
  };
}

export function calculateFlip(inputs: FlipCalcInputs): FlipCalcOutputs {
  const purchasePrice = clampMin(inputs.purchase_price);
  const holdMonths = Math.max(0.5, clampMin(inputs.hold_months, 3));
  const plannedHoursFlown = clampMin(inputs.planned_hours_flown);
  const acquisitionCapex = sum((inputs.acquisition_items ?? []).map((item) => clampMin(item.amount)));
  const mustDoUpgrades = sum((inputs.upgrade_items ?? []).filter((item) => item.type === "must_do").map((item) => clampMin(item.amount)));
  const valueAddUpgrades = sum(
    (inputs.upgrade_items ?? []).filter((item) => item.type === "value_add").map((item) => clampMin(item.amount))
  );
  const contingencyAmount = (mustDoUpgrades + valueAddUpgrades) * (clampMin(inputs.maintenance_contingency_pct, 15) / 100);
  const allInBasis = purchasePrice + acquisitionCapex + mustDoUpgrades + valueAddUpgrades + contingencyAmount;
  const insuranceMonthly = clampMin(inputs.insurance_annual_premium) / 12;
  const fixedMonthly =
    clampMin(inputs.hangar_monthly) +
    insuranceMonthly +
    clampMin(inputs.subscriptions_monthly) +
    clampMin(inputs.annual_inspection_reserve_monthly) +
    clampMin(inputs.admin_overhead_monthly);
  const fixedCarryingTotal = fixedMonthly * holdMonths;
  const variablePerHour =
    clampMin(inputs.fuel_gph) * clampMin(inputs.fuel_price_per_gallon) +
    clampMin(inputs.oil_cost_per_hour) +
    clampMin(inputs.engine_reserve_per_hour) +
    clampMin(inputs.prop_reserve_per_hour) +
    clampMin(inputs.misc_maintenance_per_hour);
  const variableTotal = variablePerHour * plannedHoursFlown;

  const financingCostForHold = (scenarioHoldMonths: number) =>
    computeFinancingCost(
      Boolean(inputs.financing_enabled),
      clampMin(inputs.loan_amount),
      clampMin(inputs.interest_rate_pct, 7.5),
      clampMin(inputs.loan_term_years, 15),
      scenarioHoldMonths,
      clampMin(inputs.loan_origination_fees)
    );

  const base = buildScenario(
    clampMin(inputs.resale_base),
    holdMonths,
    allInBasis,
    fixedMonthly,
    variablePerHour,
    plannedHoursFlown,
    holdMonths,
    financingCostForHold,
    clampMin(inputs.broker_commission_pct, 5),
    clampMin(inputs.exit_escrow_fees, 500),
    clampMin(inputs.presale_spruce_up),
    clampMin(inputs.buyer_squawk_contingency_pct, 3),
    clampMin(inputs.exit_sales_tax_pct)
  );
  const low = buildScenario(
    clampMin(inputs.resale_low),
    holdMonths,
    allInBasis,
    fixedMonthly,
    variablePerHour,
    plannedHoursFlown,
    holdMonths,
    financingCostForHold,
    clampMin(inputs.broker_commission_pct, 5),
    clampMin(inputs.exit_escrow_fees, 500),
    clampMin(inputs.presale_spruce_up),
    clampMin(inputs.buyer_squawk_contingency_pct, 3),
    clampMin(inputs.exit_sales_tax_pct)
  );
  const stretch = buildScenario(
    clampMin(inputs.resale_stretch),
    holdMonths,
    allInBasis,
    fixedMonthly,
    variablePerHour,
    plannedHoursFlown,
    holdMonths,
    financingCostForHold,
    clampMin(inputs.broker_commission_pct, 5),
    clampMin(inputs.exit_escrow_fees, 500),
    clampMin(inputs.presale_spruce_up),
    clampMin(inputs.buyer_squawk_contingency_pct, 3),
    clampMin(inputs.exit_sales_tax_pct)
  );

  const slowMonths = Math.max(0.5, clampMin(inputs.days_to_sell_slow) / 30);
  const slowSale = buildScenario(
    clampMin(inputs.resale_base),
    slowMonths,
    allInBasis,
    fixedMonthly,
    variablePerHour,
    plannedHoursFlown,
    holdMonths,
    financingCostForHold,
    clampMin(inputs.broker_commission_pct, 5),
    clampMin(inputs.exit_escrow_fees, 500),
    clampMin(inputs.presale_spruce_up),
    clampMin(inputs.buyer_squawk_contingency_pct, 3),
    clampMin(inputs.exit_sales_tax_pct)
  );

  const sensitivityGrid: SensitivityCell[] = [];
  const salePcts = [-10, 0, 10];
  const dayOptions = [90, 180, 270];
  for (const days of dayOptions) {
    for (const salePct of salePcts) {
      const resalePrice = clampMin(inputs.resale_base) * (1 + salePct / 100);
      const scenario = buildScenario(
        resalePrice,
        days / 30,
        allInBasis,
        fixedMonthly,
        variablePerHour,
        plannedHoursFlown,
        holdMonths,
        financingCostForHold,
        clampMin(inputs.broker_commission_pct, 5),
        clampMin(inputs.exit_escrow_fees, 500),
        clampMin(inputs.presale_spruce_up),
        clampMin(inputs.buyer_squawk_contingency_pct, 3),
        clampMin(inputs.exit_sales_tax_pct)
      );
      sensitivityGrid.push({
        sale_price_pct: salePct,
        days_to_sell: days,
        net_profit: scenario.net_profit,
        roi_pct: scenario.roi_pct,
        annualized_roi_pct: scenario.annualized_roi_pct,
      });
    }
  }

  const saleKeepFactor = 1 - clampMin(inputs.broker_commission_pct, 5) / 100 - clampMin(inputs.exit_sales_tax_pct) / 100;
  const exitFixed =
    clampMin(inputs.exit_escrow_fees, 500) +
    clampMin(inputs.presale_spruce_up) +
    allInBasis * (clampMin(inputs.buyer_squawk_contingency_pct, 3) / 100);
  const breakevenSalePrice = saleKeepFactor > 0 ? (base.total_cash_out + exitFixed) / saleKeepFactor : 0;

  const squawkFactor = clampMin(inputs.buyer_squawk_contingency_pct, 3) / 100;
  const basisWithoutPurchase = acquisitionCapex + mustDoUpgrades + valueAddUpgrades + contingencyAmount;
  const cashOutWithoutPurchase =
    fixedCarryingTotal + variableTotal + financingCostForHold(holdMonths) + basisWithoutPurchase;
  const saleKeepAtBase = clampMin(inputs.resale_base) * saleKeepFactor;
  const targetProfit = clampMin(inputs.target_profit_dollars);
  const maxPurchasePriceForTarget =
    (saleKeepAtBase -
      clampMin(inputs.exit_escrow_fees, 500) -
      clampMin(inputs.presale_spruce_up) -
      squawkFactor * basisWithoutPurchase -
      cashOutWithoutPurchase -
      targetProfit) /
    (1 + squawkFactor);

  const monthlyBurnRate = holdMonths > 0 ? fixedMonthly + variableTotal / holdMonths : fixedMonthly;
  const impliedUpliftEstimate = Math.max(0, clampMin(inputs.resale_base) - clampMin(inputs.resale_low));
  const valueAddRoi = valueAddUpgrades > 0 ? (impliedUpliftEstimate / valueAddUpgrades) * 100 : 0;
  const negotiationTable: NegotiationRow[] = DISCOUNTS.map((discount) => {
    const offerPrice = Math.max(0, purchasePrice - discount);
    const offerAllInBasis = offerPrice + acquisitionCapex + mustDoUpgrades + valueAddUpgrades + contingencyAmount;
    const offerScenario = buildScenario(
      clampMin(inputs.resale_base),
      holdMonths,
      offerAllInBasis,
      fixedMonthly,
      variablePerHour,
      plannedHoursFlown,
      holdMonths,
      financingCostForHold,
      clampMin(inputs.broker_commission_pct, 5),
      clampMin(inputs.exit_escrow_fees, 500),
      clampMin(inputs.presale_spruce_up),
      clampMin(inputs.buyer_squawk_contingency_pct, 3),
      clampMin(inputs.exit_sales_tax_pct)
    );
    return {
      discount,
      offer_price: offerPrice,
      net_profit_base: offerScenario.net_profit,
      roi_pct_base: offerScenario.roi_pct,
    };
  });

  return {
    section_totals: {
      acquisition_capex: acquisitionCapex,
      must_do_upgrades: mustDoUpgrades,
      value_add_upgrades: valueAddUpgrades,
      all_in_basis: allInBasis,
      fixed_carrying_total: fixedCarryingTotal,
      variable_operating_total: variableTotal,
      insurance_monthly: insuranceMonthly,
      financing_cost_over_hold: financingCostForHold(holdMonths),
      exit_costs_total: exitFixed + clampMin(inputs.resale_base) * (1 - saleKeepFactor),
    },
    base,
    low,
    stretch,
    slow_sale: slowSale,
    sensitivity_grid: sensitivityGrid,
    breakeven_sale_price: breakevenSalePrice,
    max_purchase_price_for_target: maxPurchasePriceForTarget,
    monthly_burn_rate: monthlyBurnRate,
    value_add_roi: valueAddRoi,
    negotiation_table: negotiationTable,
  };
}

export function calculateDeal(inputs: DealCalcInputs): DealCalcOutputs {
  const insuranceEstimate = inputs.hold_period_months * 150;
  const fixedCosts =
    inputs.deferred_maintenance +
    inputs.avionics_upgrade_budget +
    inputs.paint_interior_budget +
    inputs.ferry_flight_cost +
    inputs.title_escrow_fees +
    insuranceEstimate;
  const totalCost = inputs.asking_price + fixedCosts;
  const profitAtAsk = inputs.estimated_resale_price - totalCost;
  const profitPercentAtAsk = totalCost > 0 ? (profitAtAsk / totalCost) * 100 : 0;
  const maxOfferPrice = inputs.estimated_resale_price - fixedCosts - inputs.target_profit_dollars;
  const negotiationTable: LegacyNegotiationRow[] = DISCOUNTS.map((discount) => {
    const offerPrice = inputs.asking_price - discount;
    const rowTotal = offerPrice + fixedCosts;
    const profit = inputs.estimated_resale_price - rowTotal;
    const profitPercent = rowTotal > 0 ? (profit / rowTotal) * 100 : 0;
    return { discount, offer_price: offerPrice, profit, profit_percent: profitPercent };
  });

  return {
    insurance_estimate: insuranceEstimate,
    total_cost: totalCost,
    profit_at_ask: profitAtAsk,
    profit_percent_at_ask: profitPercentAtAsk,
    max_offer_price: maxOfferPrice,
    negotiation_table: negotiationTable,
  };
}
