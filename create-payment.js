export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { pay_currency, tile_id, wallet } = req.body

  if (!pay_currency || tile_id === undefined || !wallet) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const response = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NOWPAYMENTS_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        price_amount: 1.00,
        price_currency: 'usd',
        pay_currency: pay_currency,
        order_id: `tile_${tile_id}_${Date.now()}`,
        order_description: `HiddenDrop Tile #${tile_id}`,
        ipn_callback_url: `${process.env.SITE_URL}/api/webhook`
      })
    })

    const payment = await response.json()

    if (!payment.pay_address) {
      return res.status(500).json({ error: 'Payment creation failed', details: payment })
    }

    return res.status(200).json({
      payment_id: payment.payment_id,
      pay_address: payment.pay_address,
      pay_amount: payment.pay_amount,
      pay_currency: payment.pay_currency
    })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
