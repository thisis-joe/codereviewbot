import { writeFile, mkdir } from 'node:fs/promises';
const auth = { httpHeaderAuth:{ id:'crbInternalAuth', name:'hey Internal' } };
const http = (name,url) => ({ id:name,name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[480,200],parameters:{ method:'POST',url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:10000} },credentials:auth,retryOnFail:true,maxTries:3,waitBetweenTries:1000 });
const schedule = (name,rule) => ({ id:name,name,type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[200,100],parameters:{ rule:{interval:[rule]} } });
const workflows = [
  { id:'crbDispatch',name:'hey — durable dispatch',active:false,nodes:[schedule('Every 10 seconds',{field:'seconds',secondsInterval:10}),{id:'Webhook',name:'Webhook',type:'n8n-nodes-base.webhook',typeVersion:2,webhookId:'crb-review-wakeup',position:[200,300],parameters:{httpMethod:'POST',path:'review-wakeup',authentication:'headerAuth',responseMode:'onReceived',options:{responseCode:{values:{responseCode:202}}}},credentials:auth},http('Dispatch','http://controller:8092/internal/tick')],connections:{'Every 10 seconds':{main:[[{node:'Dispatch',type:'main',index:0}]]},Webhook:{main:[[{node:'Dispatch',type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'Asia/Seoul'} },
  { id:'crbRecovery',name:'hey — recovery',active:false,nodes:[schedule('Every minute',{field:'minutes',minutesInterval:1}),http('Recover','http://controller:8092/internal/recover')],connections:{'Every minute':{main:[[{node:'Recover',type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'Asia/Seoul'} },
];
await mkdir('n8n',{recursive:true}); await writeFile('n8n/workflows.json',JSON.stringify(workflows,null,2)+'\n');
