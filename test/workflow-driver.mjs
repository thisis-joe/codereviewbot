import assert from 'node:assert/strict';

// The same HTTP contract as the n8n graph; provider/model fixtures stay outside this driver.
export async function driveWorkflow(base, token) {
  const request = async (path, body = {}) => {
    const response = await fetch(base + '/internal/flow' + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  let flow = await request('/claim');
  if (!flow.available) return flow;
  for (let i = 0; i < 1000; i++) {
    if (flow.status === 'pending') flow = await request(`/jobs/${flow.jobId}/step`, { owner: flow.owner, step: flow.step });
    else if (flow.status !== 'running') return flow;
    await new Promise(resolve => setTimeout(resolve, 5));
    flow = await request(`/jobs/${flow.jobId}/status`, { owner: flow.owner });
  }
  throw new Error('Workflow did not settle');
}
