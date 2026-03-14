export interface DealCalcInputs {
  asking_price: number
  deferred_maintenance: number
  avionics_upgrade_budget: number
  paint_interior_budget: number
  ferry_flight_cost: number
  hold_period_months: number
  title_escrow_fees: number
  target_profit_dollars: number
  estimated_resale_price: number
}

export interface DealCalcOutputs {
  insurance_estimate: number
  total_cost: number
  profit_at_ask: number
  profit_percent_at_ask: number
  max_offer_price: number
  negotiation_table: NegotiationRow[]
}

export interface NegotiationRow {
  discount: number
  offer_price: number
  profit: number
  profit_percent: number
}

export function calculateDeal(inputs: DealCalcInputs): DealCalcOutputs {
  const insurance_estimate = inputs.hold_period_months * 150

  const fixed_costs =
    inputs.deferred_maintenance +
    inputs.avionics_upgrade_budget +
    inputs.paint_interior_budget +
    inputs.ferry_flight_cost +
    inputs.title_escrow_fees +
    insurance_estimate

  const total_cost = inputs.asking_price + fixed_costs
  const profit_at_ask = inputs.estimated_resale_price - total_cost
  const profit_percent_at_ask = total_cost > 0 ? (profit_at_ask / total_cost) * 100 : 0

  const max_offer_price = inputs.estimated_resale_price - fixed_costs - inputs.target_profit_dollars

  const discounts = [0, 2000, 5000, 8000, 10000, 15000]
  const negotiation_table: NegotiationRow[] = discounts.map((discount) => {
    const offer_price = inputs.asking_price - discount
    const row_total = offer_price + fixed_costs
    const profit = inputs.estimated_resale_price - row_total
    const profit_percent = row_total > 0 ? (profit / row_total) * 100 : 0
    return { discount, offer_price, profit, profit_percent }
  })

  return {
    insurance_estimate,
    total_cost,
    profit_at_ask,
    profit_percent_at_ask,
    max_offer_price,
    negotiation_table,
  }
}
