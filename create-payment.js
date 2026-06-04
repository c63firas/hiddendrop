export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if(req.method === 'OPTIONS') return res.status(200).end()
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { pay_currency, amount, tile_id, image_id, wallet, type } = req.body

  try {
    const isDeposit = type === 'deposit'
    const price = isDeposit ? amount : 2.00
    const orderId = isDeposit 
      ? `deposit_${wallet}_${Date.now()}`
      : `tile_${image_id}_${tile_id}_${Date.now()}`
    const description = isDeposit
      ? `HiddenDrop Deposit $${amount}`
      : `HiddenDrop Tile #${tile_id}`

    const response = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: { 'x-api-key': process.env.NOWPAYMENTS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: price,
        price_currency: 'usd',
        pay_currency,
        order_id: orderId,
        order_description: description,
        ipn_callback_url: `${process.env.SITE_URL}/api/webhook`
      })
    })

    const payment = await response.json()
    if(!payment.pay_address) return res.status(500).json({ error: 'Payment failed', details: payment })

    return res.status(200).json({
      payment_id: payment.payment_id,
      pay_address: payment.pay_address,
      pay_amount: payment.pay_amount,
      pay_currency: payment.pay_currency
    })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
