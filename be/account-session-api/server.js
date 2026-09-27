const express = require('express');

const app = express();
const port = Number(process.env.ACCOUNT_API_PORT || 4100);
const backendUrl = (process.env.ATS_BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'account-session-api' }));

// Pass only account-control operations through to the authenticated ATS backend.
app.all('/api/users/:id/:operation', async (req, res) => {
  const { operation } = req.params;
  if (!['disable', 'enable', 'revoke-sessions'].includes(operation)) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  }

  const method = operation === 'revoke-sessions' ? 'POST' : 'PATCH';
  if (req.method !== method) {
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: `Use ${method}.` } });
  }

  try {
    const upstream = await fetch(`${backendUrl}/api/users/${encodeURIComponent(req.params.id)}/${operation}`, {
      method,
      headers: {
        authorization: req.get('authorization') || '',
        'content-type': 'application/json',
        'user-agent': req.get('user-agent') || 'account-session-api',
      },
      body: method === 'POST' ? '{}' : undefined,
    });
    const body = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(body);
  } catch (_error) {
    res.status(502).json({ success: false, error: { code: 'BACKEND_UNAVAILABLE', message: 'ATS backend is unavailable.' } });
  }
});

app.listen(port, () => console.log(`Account session API listening on ${port}; backend: ${backendUrl}`));
