const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ohmptflnwplotzfwnsuq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9obXB0Zmxud3Bsb3R6Znduc3VxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDk5MzEsImV4cCI6MjA5NzEyNTkzMX0.GtlDRgKW6surk-O_2jU1oChDOUnLGN_oIRblvfcF4k8';

module.exports = async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { store_id, seenow_slug } = req.query;

  try {
    let targetStoreId = store_id;

    // seenow_slug가 전달된 경우 stores 테이블에서 store_id 조회
    if (!targetStoreId && seenow_slug) {
      const storeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stores?seenow_url=ilike.*${encodeURIComponent(seenow_slug)}*&select=id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      const storeData = await storeRes.json();
      if (Array.isArray(storeData) && storeData.length > 0) {
        targetStoreId = storeData[0].id;
      }
    }

    if (!targetStoreId) {
      return res.status(400).json({ error: 'store_id or valid seenow_slug parameter is required' });
    }

    // faqs 테이블 조회
    const faqRes = await fetch(
      `${SUPABASE_URL}/rest/v1/faqs?store_id=eq.${targetStoreId}&order=created_at.asc&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!faqRes.ok) {
      const errText = await faqRes.text();
      return res.status(faqRes.status).json({ error: 'Failed to fetch FAQs', details: errText });
    }

    const faqs = await faqRes.json();
    return res.status(200).json({ success: true, count: faqs.length, faqs });
  } catch (error) {
    console.error('FAQ API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
