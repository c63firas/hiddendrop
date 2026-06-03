export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { id } = req.query
  if(!id) return res.status(400).json({ error: 'Missing payment id' })
  try {
    const response = await fetch(`https://api.nowpayments.io/v1/payment/${id}`, {
      headers: { 'x-api-key': process.env.NOWPAYMENTS_KEY }
    })
    const data = await response.json()
    return res.status(200).json(data)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
