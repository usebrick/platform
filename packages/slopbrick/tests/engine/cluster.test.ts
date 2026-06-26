import { describe, it, expect } from 'vitest';
import {
  detectCrossFileDrift,
  detectCrossCategoryDrift,
  type CrossFileDriftSignal,
} from '../../src/engine/cluster';
import type { PatternInventory } from '../../src/mcp/patterns';

function emptyInventory(): PatternInventory {
  return {
    scannedFiles: 0,
    patterns: {
      modal: [],
      button: [],
      api: [],
      state: [],
      dataFetching: [],
      service: [],
      route: [],
      ormModel: [],
    },
  };
}

describe('detectCrossFileDrift', () => {
  it('returns empty for an inventory with no patterns', () => {
    expect(detectCrossFileDrift(emptyInventory())).toEqual([]);
  });

  it('returns empty when each stem has only 1 variant (no drift)', () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'UserService', files: ['a.py'], imports: [] });
    inv.patterns.service.push({ name: 'OrderService', files: ['b.py'], imports: [] });
    expect(detectCrossFileDrift(inv)).toEqual([]);
  });

  it("flags UserService + UserManager + UserHandler as drift on stem 'User'", () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'UserService', files: ['a.py'], imports: [] });
    inv.patterns.service.push({ name: 'UserManager', files: ['b.py'], imports: [] });
    inv.patterns.service.push({ name: 'UserHandler', files: ['c.py'], imports: [] });
    const signals = detectCrossFileDrift(inv);
    expect(signals).toHaveLength(1);
    const signal = signals[0]!;
    expect(signal.category).toBe('service');
    expect(signal.stem).toBe('User');
    expect(signal.variants.sort()).toEqual(['UserHandler', 'UserManager', 'UserService']);
    expect(signal.files.sort()).toEqual(['a.py', 'b.py', 'c.py']);
  });

  it('treats UserService and UserRepository as drift on stem User (RepositoryClient composite)', () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'UserService', files: ['a.py'], imports: [] });
    inv.patterns.service.push({ name: 'UserRepository', files: ['b.py'], imports: [] });
    const signals = detectCrossFileDrift(inv);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.stem).toBe('User');
    expect(signals[0]!.variants.sort()).toEqual(['UserRepository', 'UserService']);
  });

  it('does NOT drift User vs Order (different stems)', () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'UserService', files: ['a.py'], imports: [] });
    inv.patterns.service.push({ name: 'OrderService', files: ['b.py'], imports: [] });
    expect(detectCrossFileDrift(inv)).toEqual([]);
  });

  it('drift signals are sorted by variant count desc, then stem alpha', () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'AuthService', files: [], imports: [] });
    inv.patterns.service.push({ name: 'AuthManager', files: [], imports: [] });
    inv.patterns.service.push({ name: 'UserService', files: [], imports: [] });
    inv.patterns.service.push({ name: 'UserManager', files: [], imports: [] });
    inv.patterns.service.push({ name: 'UserHandler', files: [], imports: [] });
    const signals = detectCrossFileDrift(inv);
    expect(signals.map((s: CrossFileDriftSignal) => s.stem)).toEqual(['User', 'Auth']);
  });

  it('flags route drift: /users and /users/:id are same resource', () => {
    const inv = emptyInventory();
    inv.patterns.route.push({ name: '/users', files: ['routes/users.py'], imports: [] });
    inv.patterns.route.push({ name: '/users/:id', files: ['routes/user.py'], imports: [] });
    const signals = detectCrossFileDrift(inv);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.category).toBe('route');
  });

  it('flags separate categories independently (modal User + button User is two findings)', () => {
    const inv = emptyInventory();
    // 2 variants in modal (drift within modal)
    inv.patterns.modal.push({ name: 'UserModal', files: ['UserModal.tsx'], imports: [] });
    inv.patterns.modal.push({ name: 'UserDialog', files: ['UserDialog.tsx'], imports: [] });
    // 2 variants in button (drift within button)
    inv.patterns.button.push({ name: 'UserButton', files: ['UserButton.tsx'], imports: [] });
    inv.patterns.button.push({ name: 'UserIcon', files: ['UserIcon.tsx'], imports: [] });
    const signals = detectCrossFileDrift(inv);
    expect(signals).toHaveLength(2);
    expect(signals.map((s: CrossFileDriftSignal) => s.category).sort()).toEqual(['button', 'modal']);
  });
});

describe('detectCrossCategoryDrift', () => {
  it('returns empty for single-category drift only', () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'UserService', files: ['a.py'], imports: [] });
    inv.patterns.service.push({ name: 'UserManager', files: ['b.py'], imports: [] });
    const inCategory = detectCrossFileDrift(inv);
    expect(detectCrossCategoryDrift(inCategory)).toEqual([]);
  });

  it('flags stem appearing in both service and ormModel', () => {
    const inv = emptyInventory();
    inv.patterns.service.push({ name: 'UserService', files: ['user_service.py'], imports: [] });
    inv.patterns.service.push({ name: 'UserManager', files: ['user_manager.py'], imports: [] });
    // 2 variants in ormModel that both strip to "User" via "Model" suffix.
    inv.patterns.ormModel.push({ name: 'User', files: ['user_model.py'], imports: [] });
    inv.patterns.ormModel.push({ name: 'UserModel', files: ['user_models.py'], imports: [] });
    const inCategory = detectCrossFileDrift(inv);
    const cross = detectCrossCategoryDrift(inCategory);
    expect(cross).toHaveLength(1);
    expect(cross[0]!.stem).toBe('User');
    expect(cross[0]!.byCategory.get('service')).toEqual(['UserManager', 'UserService']);
    expect(cross[0]!.byCategory.get('ormModel')).toEqual(['User', 'UserModel']);
    expect(cross[0]!.files.sort()).toEqual([
      'user_manager.py',
      'user_model.py',
      'user_models.py',
      'user_service.py',
    ]);
  });
});
