// api/proxy.js
export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const BRAPI_TOKEN = 'ws5Toz7mQL85uqbuWcXTDo';
  
  try {
    const { tickers } = req.query;
    
    if (!tickers) {
      return res.status(400).json({ error: 'Tickers não fornecidos' });
    }

    console.log(`🔍 Proxy buscando: ${tickers}`);
    
    const response = await fetch(
      `https://brapi.dev/api/quote/${tickers}?token=${BRAPI_TOKEN}`
    );
    
    const data = await response.json();
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro no proxy:', error);
    return res.status(500).json({ error: 'Erro ao buscar preços' });
  }
}
