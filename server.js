import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const app = express()
app.use(cors())
app.use(express.json())

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// ─── CREATE PAYMENT ───────────────────────────────────────────────
app.post('/api/create-payment', async (req, res) => {
  const { pay_currency, amount, tile_id, image_id, wallet, type } = req.body
  try {
    const isDeposit = type === 'deposit'
    const price = isDeposit ? amount : 2.00
    const orderId = isDeposit
      ? `deposit_${wallet}_${Date.now()}`
      : `tile_${image_id}_${tile_id}_${Date.now()}`

    const response = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: { 'x-api-key': process.env.NOWPAYMENTS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: price,
        price_currency: 'usd',
        pay_currency,
        order_id: orderId,
        order_description: isDeposit ? `HiddenDrop Deposit $${amount}` : `HiddenDrop Tile #${tile_id}`,
        ipn_callback_url: `${process.env.SITE_URL}/api/webhook`
      })
    })

    const payment = await response.json()
    if(!payment.pay_address) return res.status(500).json({ error: 'Payment failed', details: payment })

    return res.json({
      payment_id: payment.payment_id,
      pay_address: payment.pay_address,
      pay_amount: payment.pay_amount,
      pay_currency: payment.pay_currency
    })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
})

// ─── CHECK PAYMENT ────────────────────────────────────────────────
app.get('/api/check-payment', async (req, res) => {
  const { id } = req.query
  if(!id) return res.status(400).json({ error: 'Missing id' })
  try {
    const response = await fetch(`https://api.nowpayments.io/v1/payment/${id}`, {
      headers: { 'x-api-key': process.env.NOWPAYMENTS_KEY }
    })
    const data = await response.json()
    return res.json(data)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
})

// ─── WEBHOOK ──────────────────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  try {
    const { payment_status, order_id, payment_id } = req.body
    if(payment_status !== 'finished' && payment_status !== 'confirmed') return res.json({ ok: true })

    if(order_id.startsWith('deposit_')) {
      // Extract wallet and amount from order_id: deposit_WALLET_TIMESTAMP
      const parts = order_id.split('_')
      const wallet = parts[1]
      const amount = parseFloat(req.body.price_amount) || 0

      const { data: user } = await db.from('users').select('balance').eq('wallet', wallet).single()
      const newBalance = (parseFloat(user?.balance) || 0) + amount
      await db.from('users').update({ balance: newBalance, total_deposited: newBalance }).eq('wallet', wallet)

    } else {
      // Tile payment: tile_IMAGEID_TILEID_TIMESTAMP
      const parts = order_id.split('_')
      const tileId = parseInt(parts[parts.length - 2])
      const imageId = parts.slice(1, parts.length - 2).join('_')

      await db.from('tiles').update({
        revealed: true,
        payment_id,
        revealed_at: new Date().toISOString()
      }).eq('id', tileId).eq('image_id', imageId)
    }

    return res.json({ ok: true })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 10000
app.listen(PORT, '0.0.0.0', () => console.log(`HiddenDrop API running on port ${PORT}`))
