// The "kitchen": runs on Vercel's server, so your secret key stays hidden.

// Change the model here if you ever need to
const MODEL = 'gemini-3.5-flash-lite';

// How the AI should write for each style
const STYLES = {
  simple:  'Explain like I am 10 years old. Use very simple words and short sentences. Give 4 to 5 items.',
  exam:    'Write quick exam revision notes. Each item is a crisp key point with a precise definition or fact. Give 5 to 7 items.',
  example: 'Explain using relatable real-life examples and analogies from everyday student life. Give 3 to 4 items.'
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const body = req.body || {};
  const concept = String(body.concept || '').trim().slice(0, 100);
  const subject = String(body.subject || '').trim().slice(0, 60);
  const style = STYLES[body.style] ? body.style : 'simple';

  if (!concept) {
    return res.status(400).json({ error: 'Please enter a topic.' });
  }
  if (!subject) {
    return res.status(400).json({ error: 'Please enter a subject.' });
  }

  // The key comes from Vercel's settings, never from the code
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server key is missing.' });
  }

  // Our instruction (prompt) to the AI
  const prompt =
    'You are a friendly teacher helping a college student. Explain the concept "' + concept +
    '" strictly as it is used in the subject "' + subject + '" (ignore meanings from other fields).\n' +
    STYLES[style] + '\n' +
    'Be accurate. Return JSON in this shape: {"title": string, "items": [ {"emoji": one emoji, ' +
    '"heading": short string, "text": string} ]}.';

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = (data.error && data.error.message) || 'AI request failed.';
      return res.status(500).json({ error: msg });
    }

    // Pull the AI's text out of the reply and turn it into an object
    const text = data.candidates[0].content.parts[0].text;
    const result = JSON.parse(text);
    if (!result.title || !Array.isArray(result.items) || result.items.length === 0) {
      return res.status(500).json({ error: 'The AI gave a strange answer. Please try again.' });
    }
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'Could not generate. Please try again.' });
  }
};