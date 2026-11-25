import {expect,it} from 'vitest';
import {newGymDepositsAvailable} from './gym-deposit-availability';

it('starts at midnight on 1 December in Malaysia', () => {
  expect(newGymDepositsAvailable(new Date('2026-11-30T15:59:59Z'))).toBe(false);
  expect(newGymDepositsAvailable(new Date('2026-11-30T16:00:00Z'))).toBe(true);
});
