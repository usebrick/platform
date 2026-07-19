import { CAL002_CPP_RUST_TRANSFER_ORACLES } from './cal-002-transfer-oracle-cpp-rust';
import { CAL002_DEAD_TRANSFER_ORACLES } from './cal-002-transfer-oracle-dead';
import { CAL002_SECURITY_TRANSFER_ORACLES } from './cal-002-transfer-oracle-security';
import type { CAL002TransferredOracleFixture } from './cal-002-transfer-oracle-types';

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const CAL002_TRANSFER_ORACLE_CASES: readonly CAL002TransferredOracleFixture[] = [
  ...CAL002_CPP_RUST_TRANSFER_ORACLES,
  ...CAL002_DEAD_TRANSFER_ORACLES,
  ...CAL002_SECURITY_TRANSFER_ORACLES,
].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
