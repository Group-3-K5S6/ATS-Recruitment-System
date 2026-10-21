import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { filterPublicJobs, publicJobFilterOptions } from '../src/features/sprint4/publicJobFilters.ts';
const now = new Date('2026-10-21T08:00:00.000Z');
const base = { id:'1', title:'Lập trình viên React', description:'Thiết kế giao diện tuyển dụng', location:'Thái Nguyên', workMode:'HYBRID', department:{name:'Kỹ thuật'}, status:'PUBLISHED', approvedAt:'2026-10-18',publishedAt:'2026-10-19',applicationDeadline:'2026-12-31T23:59:59Z' };
const filters = { keyword:'', department:'ALL', location:'ALL', workMode:'ALL' };
test('S4-01 filters location, department and work mode',()=>{
  assert.equal(filterPublicJobs([base], {...filters, location:'Hà Nội'}, now).length, 0);
  assert.equal(filterPublicJobs([base], {...filters, department:'Nhân sự'}, now).length, 0);
  assert.equal(filterPublicJobs([base], {...filters, workMode:'HYBRID'}, now).length, 1);
  assert.deepEqual(publicJobFilterOptions([base],now).locations,['Thái Nguyên']);
});
test('S4-01 searches both title and description accent-insensitively',()=>{
  assert.equal(filterPublicJobs([base], {...filters, keyword:'lap trinh'}, now).length, 1);
  assert.equal(filterPublicJobs([base], {...filters, keyword:'giao dien'}, now).length, 1);
  assert.equal(filterPublicJobs([base], {...filters, keyword:'khong co'}, now).length, 0);
});
test('S4-01 excludes unpublished or expired jobs',()=>{
  assert.deepEqual(filterPublicJobs([base,{...base,id:'2',status:'DRAFT'},{...base,id:'3',applicationDeadline:'2026-01-01'}], filters,now).map(x=>x.id),['1']);
});
