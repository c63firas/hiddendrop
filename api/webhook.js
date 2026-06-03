import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    // Verify NOWPayments signature
    const signature = req.headers['x-nowpayments-sig']
    const secret = process.env.NOWPAYMENTS_IPN_SECRET

    if (secret && signature) {
      const hmac = crypto.createHmac('sha512', secret)
      hmac.update(JSON.stringify(req.body, Object.keys(req.body).sort()))
      const digest = hmac.digest('hex')
      if (digest !== signature) {
        return res.status(401).json({ error: 'Invalid signature' })
      }
    }

    const { payment_status, order_id, payment_id } = req.body

    // Only process confirmed/finished payments
    if (payment_status !== 'finished' && payment_status !== 'confirmed') {
      return res.status(200).json({ ok: true })
    }

    // Extract tile_id from order_id (format: tile_X_timestamp)
    const tileId = parseInt(order_id.split('_')[1])
    if (isNaN(tileId)) return res.status(400).json({ error: 'Invalid order_id' })

    // Get wallet from tiles table
    const { data: tile } = await db.from('tiles').select('wallet').eq('id', tileId).single()

    // Mark tile as revealed
    await db.from('tiles').update({
      revealed: true,
      payment_id: payment_id,
      revealed_at: new Date().toISOString()
    }).eq('id', tileId)

    // Update prize pool
    const { data: gs } = await db.from('game_state').select('total_paid').eq('id', 1).single()
    await db.from('game_state').update({
      total_paid: (gs?.total_paid || 0) + 1.00
    }).eq('id', 1)

    // Check if this was the last tile
    const { count } = await db.from('tiles').select('*', { count: 'exact' }).eq('revealed', false)
    if (count === 0) {
      // Last tile! Save winner
      await db.from('game_state').update({
        last_tile_winner: tile?.wallet || 'unknown'
      }).eq('id', 1)
    }

    return res.status(200).json({ ok: true })

  } catch (e) {
    console.error('Webhook error:', e)
    return res.status(500).json({ error: e.message })
  }
}
