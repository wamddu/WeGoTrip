import assert from 'node:assert/strict';
import { dateRange, emptyTrip, members, sampleTrip, settlement } from '../src/demo/model.ts';

const sample = sampleTrip();
const result = settlement(sample.expenses);
assert.equal(sample.expenses.reduce((sum, e) => sum + e.amount, 0), 380000);
assert.equal(result.balances['지우'].balance, 17000);
assert.equal(result.balances['민수'].balance, 145000);
assert.equal(result.balances['서연'].balance, -67000);
assert.equal(result.balances['도윤'].balance, -95000);

function verifySettlement(expenses) {
  const { balances, transfers } = settlement(expenses);
  assert.equal(Object.values(balances).reduce((sum, b) => sum + b.balance, 0), 0);
  assert.equal(Object.values(balances).reduce((sum, b) => sum + b.share, 0), expenses.reduce((sum, e) => sum + e.amount, 0));
  const remaining = Object.fromEntries(members.map(m => [m, balances[m].balance]));
  for (const transfer of transfers) {
    assert.ok(Number.isSafeInteger(transfer.amount) && transfer.amount > 0);
    remaining[transfer.from] += transfer.amount;
    remaining[transfer.to] -= transfer.amount;
  }
  assert.ok(Object.values(remaining).every(balance => balance === 0));
}
verifySettlement([]);
verifySettlement(sample.expenses);
for (const amount of [1, 2, 100, 10001, 100000000]) {
  for (let count = 1; count <= 4; count++) {
    verifySettlement([{ id: 'test', title: '분할', amount, payer: '도윤', participants: members.slice(0, count) }]);
  }
}
assert.equal(settlement([{ id: 'test', title: '나머지', amount: 100, payer: '도윤', participants: members.slice(0, 3) }]).balances['지우'].share, 34);
assert.deepEqual(dateRange('2026-09-19', '2026-09-20'), ['2026-09-19', '2026-09-20']);
assert.deepEqual(dateRange('2026-09-20', '2026-09-19'), []);
assert.deepEqual(dateRange('2026-02-30', '2026-03-01'), []);
assert.deepEqual(dateRange('2026-09-01', '2026-09-30'), []);
assert.equal(dateRange('2026-12-31', '2027-01-01').length, 2);
const other = emptyTrip('새 여행', '부산', ['2026-09-19']);
assert.equal(other.expenses.length, 0);
assert.equal(other.schedules.length, 0);
assert.notEqual(other.id, sample.id);
console.log('Demo checks passed: sample balances, exact-won splits, repayment conservation, dates, and fresh trip data.');
