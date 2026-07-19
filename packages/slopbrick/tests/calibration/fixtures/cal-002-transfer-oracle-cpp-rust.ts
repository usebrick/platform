import {
  fiveControls,
  sourceText,
  type CAL002TransferredOracleFixture,
} from './cal-002-transfer-oracle-types';

export const CAL002_CPP_RUST_TRANSFER_ORACLES = [
  {
    ruleId: 'cpp/c-style-cast',
    authority: 'language-contract',
    reference: 'C++ Core Guidelines ES.49',
    execution: sourceText('src/oracle.cpp'),
    positiveCases: [
      {
        caseId: 'cpp-c-cast-int',
        virtualPath: 'src/oracle.cpp',
        source: 'int y = (int)x;',
      },
    ],
    negativeCases: [
      {
        caseId: 'cpp-c-cast-named',
        virtualPath: 'src/oracle.cpp',
        source: 'int y = static_cast<int>(x);',
      },
    ],
    adversarialCases: [
      {
        caseId: 'cpp-c-cast-void-discard',
        virtualPath: 'src/oracle.cpp',
        source: '(void)computeValue();',
      },
      {
        caseId: 'cpp-c-cast-control-flow',
        virtualPath: 'src/oracle.cpp',
        source: 'if (x) { work(); }',
      },
    ],
    controls: fiveControls('src/oracle.cpp', [
      'auto y = static_cast<long>(x);',
      'auto y = dynamic_cast<Node*>(base);',
      '// int y = (int)x;\nauto y = x;',
      'auto y = int{x};',
      'auto y = static_cast<MyClass*>(base);',
    ]),
  },
  {
    ruleId: 'cpp/raw-new-delete',
    authority: 'language-contract',
    reference: 'C++ Core Guidelines R.11 and R.20',
    execution: sourceText('src/oracle.cpp'),
    positiveCases: [
      {
        caseId: 'cpp-two-new-delete-pairs',
        virtualPath: 'src/oracle.cpp',
        source: 'void f(){ Foo* a=new Foo(); Bar* b=new Bar(); delete a; delete b; }',
      },
    ],
    negativeCases: [
      {
        caseId: 'cpp-smart-pointers',
        virtualPath: 'src/oracle.cpp',
        source: 'void f(){ auto a=std::make_unique<Foo>(); auto b=std::make_unique<Bar>(); }',
      },
    ],
    adversarialCases: [
      {
        caseId: 'cpp-array-allocation',
        virtualPath: 'src/oracle.cpp',
        source: 'void f(){ int* xs=new int[10]; delete[] xs; }',
      },
    ],
    controls: fiveControls('src/oracle.cpp', [
      'auto a=std::make_shared<Foo>();',
      'Foo value{};',
      '// Foo* a=new Foo(); delete a;\nFoo value{};',
      'void* p=allocate(); release(p);',
      'std::vector<Foo> values(2);',
    ]),
  },
  {
    ruleId: 'rust/todo-macro',
    authority: 'language-contract',
    reference: 'Rust standard library todo! macro contract',
    execution: sourceText('src/oracle.rs'),
    positiveCases: [
      {
        caseId: 'rust-production-todo',
        virtualPath: 'src/oracle.rs',
        source: 'fn load() -> i32 { todo!("load") }',
      },
    ],
    negativeCases: [
      {
        caseId: 'rust-implemented-body',
        virtualPath: 'src/oracle.rs',
        source: 'fn load() -> i32 { 42 }',
      },
    ],
    adversarialCases: [
      {
        caseId: 'rust-test-todo',
        virtualPath: 'src/oracle.rs',
        source: '#[test]\nfn pending_case(){ todo!() }',
      },
      {
        caseId: 'rust-macro-definition',
        virtualPath: 'src/oracle.rs',
        source: 'macro_rules! deferred { () => { todo!() } }',
      },
    ],
    controls: fiveControls('src/oracle.rs', [
      'fn load()->Result<i32,Error>{ Err(Error::Pending) }',
      'fn load()->i32{ 42 }',
      '// todo!()\nfn load()->i32{ 42 }',
      'fn todo_count()->usize{ 0 }',
      'unimplemented_feature();',
    ]),
  },
] as const satisfies readonly CAL002TransferredOracleFixture[];
