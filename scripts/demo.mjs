import { mkdir, writeFile } from 'node:fs/promises';
import { renderReport, renderFinding } from '../dist/render.js';
import { report, finding } from '../test/fixtures.mjs';
const value = report({ findings: [finding({ id:'CRB-0001' })], changes:[{name:'결제 재시도',files:['src/pay.ts'],description:'실패한 결제 요청 재시도 추가',impact:'결제 승인·주문 저장'}], delta:{added:['CRB-0001'],retained:[],fixed:[],dismissed:[],unverified:[]}, limitations:['출력 양식을 보여주기 위한 테스트 예시입니다. 실제 저장소의 검토 결과가 아닙니다.'] });
await mkdir('.local',{recursive:true});
await writeFile('.local/demo-report.md',renderReport(value)+'\n');
await writeFile('.local/demo-inline.md',renderFinding(value.findings[0],value.snapshot)+'\n');
console.log('Created .local/demo-report.md and .local/demo-inline.md (fixtures, no model calls).');
