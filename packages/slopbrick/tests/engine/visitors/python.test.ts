import { describe, it, expect } from 'vitest';
import { extractPythonPatterns } from '../../../src/engine/visitors/python';

describe('extractPythonPatterns', () => {
  describe('service detection', () => {
    it('extracts a class ending in Service as a service pattern (FULL name preserved)', () => {
      const source = `class UserService:
    def get_user(self, id):
        return {"id": id}
`;
      const result = extractPythonPatterns('/path/to/user_service.py', source);
      expect(result.service).toHaveLength(1);
      // v0.9.2 phase 4: visitor emits the FULL class name (e.g.
      // "UserService"). The cluster in src/engine/cluster.ts strips
      // suffixes to derive the stem, so emitting the original name
      // lets the cluster see UserService + UserManager + UserHandler
      // as 3 distinct variants for drift detection.
      expect(result.service[0]?.name).toBe('UserService');
      expect(result.service[0]?.files).toEqual(['/path/to/user_service.py']);
      expect(result.service[0]?.imports).toEqual([]);
      expect(result.route).toEqual([]);
      expect(result.ormModel).toEqual([]);
    });

    it('emits separate PatternMatches for Manager / Handler / Repository / Controller / Helper', () => {
      // Each class name has a different suffix; the visitor emits one
      // PatternMatch per match with the FULL name (no stripping).
      const cases: Array<[string, string]> = [
        ['class OrderManager:\n    pass', 'OrderManager'],
        ['class EventHandler:\n    pass', 'EventHandler'],
        ['class UserRepository:\n    pass', 'UserRepository'],
        ['class AuthController:\n    pass', 'AuthController'],
        ['class StringHelper:\n    pass', 'StringHelper'],
      ];
      for (const [src, expected] of cases) {
        const result = extractPythonPatterns('/a.py', src);
        expect(result.service).toHaveLength(1);
        expect(result.service[0]?.name).toBe(expected);
      }
    });

    it('preserves suffix on a class that also inherits from a base', () => {
      const source = `class PaymentService(BaseService):
    def charge(self, amount): ...
`;
      const result = extractPythonPatterns('/payments.py', source);
      expect(result.service).toHaveLength(1);
      expect(result.service[0]?.name).toBe('PaymentService');
    });

    it('does not match a plain class with no service suffix', () => {
      const source = `class Foo:
    pass
`;
      const result = extractPythonPatterns('/a.py', source);
      expect(result.service).toEqual([]);
    });

    it('emits ALL service matches in a single file (UserService + UserManager + UserHandler)', () => {
      // The cluster dedupes by stem across the inventory, so the
      // visitor must emit each variant separately — otherwise the
      // cluster sees only 1 variant and misses drift.
      const source = `class UserService:
    pass

class UserManager:
    pass

class UserHandler:
    pass
`;
      const result = extractPythonPatterns('/user.py', source);
      expect(result.service).toHaveLength(3);
      expect(result.service.map((s) => s.name).sort()).toEqual([
        'UserHandler',
        'UserManager',
        'UserService',
      ]);
    });
  });

  describe('route detection', () => {
    it('extracts Flask @app.route as a route pattern', () => {
      const source = `from flask import Flask

app = Flask(__name__)

@app.route('/hello')
def hello():
    return 'Hello, World!'
`;
      const result = extractPythonPatterns('/path/to/app.py', source);
      expect(result.route).toHaveLength(1);
      expect(result.route[0]?.name).toBe('/hello');
      expect(result.route[0]?.files).toEqual(['/path/to/app.py']);
    });

    it('extracts FastAPI @router.get as a route pattern', () => {
      const source = `from fastapi import APIRouter

router = APIRouter()

@router.get('/users')
def list_users():
    return []
`;
      const result = extractPythonPatterns('/path/to/users.py', source);
      expect(result.route).toHaveLength(1);
      expect(result.route[0]?.name).toBe('/users');
    });

    it('extracts Blueprint @bp.route as a route pattern', () => {
      const source = `from flask import Blueprint

bp = Blueprint('api', __name__)

@bp.route('/items')
def items():
    return []
`;
      const result = extractPythonPatterns('/path/to/items.py', source);
      expect(result.route).toHaveLength(1);
      expect(result.route[0]?.name).toBe('/items');
    });

    it('emits ALL routes per file (v0.9.2 phase 4: cluster needs multiple variants)', () => {
      const source = `@router.post('/orders')
def create_order(): pass

@router.delete('/orders/{id}')
def delete_order(id: int): pass
`;
      const result = extractPythonPatterns('/api.py', source);
      // v0.9.2 phase 4: visitor emits ALL routes per file. The cluster
      // normalizes route paths (strips :param / {param}) so /orders and
      // /orders/{id} cluster as the same resource.
      expect(result.route).toHaveLength(2);
      expect(result.route.map((r) => r.name).sort()).toEqual([
        '/orders',
        '/orders/{id}',
      ]);
    });

    it('emits all matches when both Flask and FastAPI decorators exist', () => {
      const source = `@app.route('/flask')
def a(): pass

@router.get('/fastapi')
def b(): pass
`;
      const result = extractPythonPatterns('/mixed.py', source);
      expect(result.route).toHaveLength(2);
      expect(result.route.map((r) => r.name).sort()).toEqual([
        '/fastapi',
        '/flask',
      ]);
    });
  });

  describe('ormModel detection', () => {
    it('extracts SQLAlchemy class inheriting Base as an ormModel pattern', () => {
      const source = `from sqlalchemy import Column, Integer, String
from database import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String)
`;
      const result = extractPythonPatterns('/path/to/models.py', source);
      expect(result.ormModel).toHaveLength(1);
      expect(result.ormModel[0]?.name).toBe('User');
      expect(result.ormModel[0]?.files).toEqual(['/path/to/models.py']);
      expect(result.ormModel[0]?.imports).toEqual([]);
    });

    it('extracts Django Model inheritance', () => {
      const source = `class Article(Model):
    title = "..."
`;
      const result = extractPythonPatterns('/models.py', source);
      expect(result.ormModel).toHaveLength(1);
      expect(result.ormModel[0]?.name).toBe('Article');
    });

    it('extracts TimescaleDB hypertable class', () => {
      const source = `class Reading(TimescaleMixin):
    timestamp = ...
`;
      const result = extractPythonPatterns('/readings.py', source);
      expect(result.ormModel).toHaveLength(1);
      expect(result.ormModel[0]?.name).toBe('Reading');
    });

    it('does not match a class that inherits from a non-ORM base', () => {
      const source = `class Foo(MyCustomBase):
    pass
`;
      const result = extractPythonPatterns('/a.py', source);
      expect(result.ormModel).toEqual([]);
    });
  });

  describe('empty file', () => {
    it('returns empty arrays for an empty file', () => {
      const result = extractPythonPatterns('/path/to/empty.py', '');
      expect(result).toEqual({ service: [], route: [], ormModel: [] });
    });

    it('returns empty arrays for whitespace-only content', () => {
      const result = extractPythonPatterns('/path/to/blank.py', '   \n\n\t\n');
      expect(result).toEqual({ service: [], route: [], ormModel: [] });
    });
  });

  describe('combined cases', () => {
    it('detects service + ormModel together when both apply', () => {
      // v0.9.2 phase 4: visitor emits FULL names. Both UserService
      // (service) and Account (ormModel) are independent entries.
      const source = `class UserService:
    def get(self, id): ...

class Account(Base):
    __tablename__ = 'accounts'
`;
      const result = extractPythonPatterns('/app.py', source);
      expect(result.service).toHaveLength(1);
      expect(result.service[0]?.name).toBe('UserService');
      expect(result.ormModel).toHaveLength(1);
      expect(result.ormModel[0]?.name).toBe('Account');
      expect(result.route).toEqual([]);
    });
  });
});
