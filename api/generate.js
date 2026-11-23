// The "kitchen": runs on Vercel's server, so your secret key stays hidden.

// Models to try, in order. If the first is busy, we try the next one.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

// How the AI should write for each style
const STYLES = {
  simple:  'Explain like I am 10 years old. Use very simple words and short sentences. Give 4 to 5 items.',
  exam:    'Write quick exam revision notes. Each item is a crisp key point with a precise definition or fact. Give 5 to 7 items.',
  example: 'Explain using relatable real-life examples and analogies from everyday student life. Give 3 to 4 items.'
};

// Small helper: wait for some milliseconds
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Asks one model. Returns { ok, status, data }
async function askModel(model, key, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const body = req.body || {};
  const concept = String(body.concept || '').trim().slice(0, 100);
  const subject = String(body.subject || '').trim().slice(0, 60);
  const style = STYLES[body.style] ? body.style : 'simple';

  if (!concept) return res.status(400).json({ error: 'Please enter a topic.' });
  if (!subject) return res.status(400).json({ error: 'Please enter a subject.' });

  // The key comes from Vercel's settings, never from the code
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server key is missing.' });

  // Our instruction (prompt) to the AI
  const prompt =
    'You are a friendly teacher helping a college student. Explain the concept "' + concept +
    '" strictly as it is used in the subject "' + subject + '" (ignore meanings from other fields).\n' +
    STYLES[style] + '\n' +
    'Be accurate. Return JSON in this shape: {"title": string, "items": [ {"emoji": one emoji, ' +
    '"heading": short string, "text": string} ]}.';

  let busy = false;

  // Try each model in turn until one works
  for (let i = 0; i < MODELS.length; i++) {
    try {
      const r = await askModel(MODELS[i], key, prompt);

      if (r.ok) {
        const text = r.data.candidates[0].content.parts[0].text;
        const result = JSON.parse(text);
        if (result.title && Array.isArray(result.items) && result.items.length > 0) {
          return res.status(200).json(result);
        }
      } else if (r.status === 429 || r.status === 503 || r.status === 500) {
        busy = true;        // Gemini is busy: wait a moment, then try again
      }
    } catch (e) {
      // network or JSON problem: just try the next attempt
    }
    if (i < MODELS.length - 1) await sleep(1000);
  }

  // All attempts failed: show a friendly message
  return res.status(503).json({
    error: busy
      ? 'The AI is very busy right now. Please wait 20 seconds and try again.'
      : 'Could not generate. Please try again.'
  });
};
