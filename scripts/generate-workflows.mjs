import { writeFile, mkdir } from 'node:fs/promises';

const credentials = { httpHeaderAuth: { id: 'crbInternalAuth', name: 'hey Internal' } };
const node = (name, type, position, parameters, typeVersion = 1) => ({ id: name, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters });
const http = (name, path, position, body, timeout = 10000) => ({
  ...node(name, 'httpRequest', position, { method: 'POST', url: path.startsWith('=') ? path : `http://controller:8092${path}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}), options: { timeout } }, 4.2),
  credentials, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000,
});
const schedule = (name, rule, position) => node(name, 'scheduleTrigger', position, { rule: { interval: [rule] } }, 1.2);
const conditions = (leftValue, rightValue, id, type = 'string', operation = 'equals') => ({ options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id, leftValue, rightValue, operator: { type, operation, ...(type === 'boolean' ? { singleValue: true } : {}) } }], combinator: 'and' });
const route = (name, field, values, position) => node(name, 'switch', position, { mode: 'rules', rules: { values: values.map(value => ({ conditions: conditions(`={{ $json.${field} }}`, value, `${field}-${value}`), renameOutput: true, outputKey: value })) }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'Unexpected state' } }, 3.2);
const edge = name => [{ node: name, type: 'main', index: 0 }];
const links = {};
const link = (from, ...targets) => { links[from] = { main: targets.map(name => name ? edge(name) : []) }; };
const phases = [['prepare', 'Prepare source'], ['generate', 'Generate questions'], ['validate', 'Validate revision'], ['publish', 'Publish questions'], ['gate', 'Sync answer gate'], ['notify', 'Queue question notification'], ['command', 'Handle command'], ['complete', 'Complete job']];
const phaseUrl = '={{ "http://controller:8092/internal/flow/jobs/" + $json.jobId + "/step" }}';
const nodes = [
  schedule('Every 10 seconds', { field: 'seconds', secondsInterval: 10 }, [0, 0]),
  { ...node('Webhook', 'webhook', [0, 200], { httpMethod: 'POST', path: 'review-wakeup', authentication: 'headerAuth', responseMode: 'onReceived', options: { responseCode: { values: { responseCode: 202 } } } }, 2), webhookId: 'crb-review-wakeup', credentials },
  http('Deliver queued notification', '/internal/flow/notifications', [240, 100], undefined, 60000),
  http('Claim durable job', '/internal/flow/claim', [480, 100]),
  node('Job available', 'if', [700, 100], { conditions: conditions('={{ $json.available }}', true, 'available', 'boolean', 'true'), options: {} }, 2.2),
  route('Choose job phase', 'step', phases.map(([step]) => step), [940, 100]),
  ...phases.map(([step, name], index) => http(name, phaseUrl, [1260, index * 160 - 420], `={{ { owner: $json.owner, step: '${step}' } }}`)),
  node('Wait for phase', 'wait', [1540, 100], { resume: 'timeInterval', amount: 2, unit: 'seconds' }, 1.1),
  http('Read phase status', '={{ "http://controller:8092/internal/flow/jobs/" + $json.jobId + "/status" }}', [1760, 100], '={{ { owner: $json.owner } }}'),
  route('Choose next action', 'status', ['pending', 'running', 'retry', 'completed', 'superseded', 'failed'], [2000, 100]),
  node('Wait until retry is due', 'wait', [2220, 360], { resume: 'specificTime', dateTime: '={{ $json.retryAt }}' }, 1.1),
  node('Job failed', 'stopAndError', [2240, 680], { errorType: 'errorMessage', errorMessage: '={{ "Job " + $json.jobId + " failed during " + ($json.failure?.step || $json.step) + " (" + ($json.failure?.code || "unknown") + "). The durable failure record is preserved." }}' }),
  node('Unexpected workflow state', 'stopAndError', [2240, 900], { errorType: 'errorMessage', errorMessage: 'Controller returned an unsupported workflow phase or status.' }),
  node('No pending job', 'noOp', [940, 940], {}),
  node('Workflow guide', 'stickyNote', [0, -460], { content: '## hey · n8n orchestration\nEach named phase executes separately. Wait/status nodes observe real completion. PostgreSQL fences owners and preserves retry checkpoints; source/prompt/question bodies never enter this workflow. Commands preserve the existing learning flow. A failed job stops visibly here; periodic recovery can admit only eligible retries.', height: 300, width: 700 }),
];
link('Every 10 seconds', 'Deliver queued notification'); link('Webhook', 'Deliver queued notification');
link('Deliver queued notification', 'Claim durable job'); link('Claim durable job', 'Job available');
link('Job available', 'Choose job phase', 'No pending job');
link('Choose job phase', ...phases.map(([, name]) => name), 'Unexpected workflow state');
for (const [, name] of phases) link(name, 'Wait for phase');
link('Wait for phase', 'Read phase status'); link('Read phase status', 'Choose next action');
link('Choose next action', 'Choose job phase', 'Wait for phase', 'Wait until retry is due', 'Deliver queued notification', 'Deliver queued notification', 'Job failed', 'Unexpected workflow state');
link('Wait until retry is due', 'Deliver queued notification');
const settings = { executionOrder: 'v1', timezone: 'Asia/Seoul' };
const workflows = [
  { id: 'crbDispatch', name: 'hey — job orchestration', active: false, nodes, connections: links, settings },
  { id: 'crbRecovery', name: 'hey — recovery', active: false, nodes: [
    schedule('Every minute', { field: 'minutes', minutesInterval: 1 }, [0, 0]),
    http('Reconcile answer gates', '/internal/flow/reconcile', [260, 0], undefined, 180000),
    http('Schedule eligible retries', '/internal/flow/recover', [540, 0], undefined, 180000),
    http('Clean expired source snapshots', '/internal/flow/cleanup', [820, 0], undefined, 180000),
    http('Deliver queued notification', '/internal/flow/notifications', [1100, 0], undefined, 60000),
  ], connections: {
    'Every minute': { main: [edge('Reconcile answer gates')] },
    'Reconcile answer gates': { main: [edge('Schedule eligible retries')] },
    'Schedule eligible retries': { main: [edge('Clean expired source snapshots')] },
    'Clean expired source snapshots': { main: [edge('Deliver queued notification')] },
  }, settings },
];
await mkdir('n8n', { recursive: true });
await writeFile('n8n/workflows.json', JSON.stringify(workflows, null, 2) + '\n');
