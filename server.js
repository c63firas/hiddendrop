import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const app = express()
app.use(cors())
app.use(express.json())

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// ─── TELEGRAM ─────────────────────────────────────────────────────
async function sendTelegram(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.8919737686:AAEw3QREj8sdy0RFRxo9qMazMQrVo7eZCME}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.1089976850, text: msg, parse_mode: 'HTML' })
    })
  } catch(e) { console.error('Telegram error:', e) }
}

// ─── CREATE PAYMENT ───────────────────────────────────────────────
app.post('/api/create-payment', async (req, res) => {
  const { pay_currency, amount, tile_id, image_id, wallet, type } = req.body
  console.log('Incoming request:', { pay_currency, amount, tile_id, image_id, wallet, type })
  try {
    const isDeposit = type === 'deposit'
    const price = isDeposit ? parseFloat(amount) : 3.00
    const currency = (pay_currency || 'USDTTRC20').toUpperCase()
    const orderId = isDeposit
      ? `deposit_${wallet}_${Date.now()}`
      : `tile_${image_id}_${tile_id}_${Date.now()}`

    console.log('Sending to NOWPayments:', { price, currency, orderId })

    const response = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: { 'x-api-key': process.env.NOWPAYMENTS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: price,
        price_currency: 'usd',
        pay_currency: currency,
        order_id: orderId,
        order_description: isDeposit ? `HiddenDrop Deposit $${amount}` : `HiddenDrop Tile #${tile_id}`,
        ipn_callback_url: `${process.env.SITE_URL}/api/webhook`
      })
    })

    const payment = await response.json()
    console.log('NOWPayments response:', JSON.stringify(payment))
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

// ─── MIN AMOUNT ───────────────────────────────────────────────────
app.get('/api/min-amount', async (req, res) => {
  try {
    const response = await fetch('https://api.nowpayments.io/v1/min-amount?currency_from=usdttrc20&currency_to=usdttrc20', {
      headers: { 'x-api-key': process.env.NOWPAYMENTS_KEY }
    })
    const data = await response.json()
    return res.json(data)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
})

// ─── GET CURRENCIES ───────────────────────────────────────────────
app.get("/api/currencies", async (req, res) => {
  try {
    const response = await fetch("https://api.nowpayments.io/v1/merchant/coins", {
      headers: { "x-api-key": process.env.NOWPAYMENTS_KEY }
    })
    const data = await response.json()
    return res.json(data)
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

      // Telegram notification
      await sendTelegram(`💰 <b>New Deposit!</b>\n\n👛 Wallet: <code>${wallet.slice(0,8)}...${wallet.slice(-6)}</code>\n💵 Amount: <b>$${amount}</b>\n⏰ ${new Date().toLocaleString()}`)

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

      // Telegram notification
      await sendTelegram(`🎮 <b>Tile Revealed!</b>\n\n🔲 Tile: <b>#${tileId}</b>\n🖼 Image: ${imageId}\n⏰ ${new Date().toLocaleString()}`)
    }

    return res.json({ ok: true })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 10000
app.listen(PORT, '0.0.0.0', () => console.log(`HiddenDrop API running on port ${PORT}`))