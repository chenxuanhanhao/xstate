import { Machine, State } from '../src/index';
import { initEvent, assign } from '../src/actions';
import { toSCXMLEvent } from '../src/utils';

const machine = Machine({
  initial: 'one',
  states: {
    one: {
      onEntry: ['enter'],
      on: {
        EXTERNAL: {
          target: 'one',
          internal: false
        },
        INERT: {
          target: 'one',
          internal: true
        },
        INTERNAL: {
          target: 'one',
          internal: true,
          actions: ['doSomething']
        },
        TO_TWO: 'two',
        TO_THREE: 'three',
        FORBIDDEN_EVENT: undefined
      }
    },
    two: {
      initial: 'deep',
      states: {
        deep: {
          initial: 'foo',
          states: {
            foo: {
              on: {
                FOO_EVENT: 'bar',
                FORBIDDEN_EVENT: undefined
              }
            },
            bar: {
              on: {
                BAR_EVENT: 'foo'
              }
            }
          }
        }
      },
      on: {
        DEEP_EVENT: '.'
      }
    },
    three: {
      type: 'parallel',
      states: {
        first: {
          initial: 'p31',
          states: {
            p31: {
              on: { P31: '.' }
            }
          }
        },
        second: {
          initial: 'p32',
          states: {
            p32: {
              on: { P32: '.' }
            }
          }
        }
      },
      on: {
        THREE_EVENT: '.'
      }
    }
  },
  on: {
    MACHINE_EVENT: '.two'
  }
});

describe('State', () => {
  describe('.changed', () => {
    it('should indicate that it is not changed if initial state', () => {
      expect(machine.initialState.changed).not.toBeDefined();
    });

    it('states from external transitions with onEntry actions should be changed', () => {
      const changedState = machine.transition(machine.initialState, 'EXTERNAL');
      expect(changedState.changed).toBe(true);
    });

    it('states from internal transitions with no actions should be unchanged', () => {
      const changedState = machine.transition(machine.initialState, 'EXTERNAL');
      const unchangedState = machine.transition(changedState, 'INERT');
      expect(unchangedState.changed).toBe(false);
    });

    it('states from internal transitions with actions should be changed', () => {
      const changedState = machine.transition(machine.initialState, 'INTERNAL');
      expect(changedState.changed).toBe(true);
    });

    it('normal state transitions should be changed (initial state)', () => {
      const changedState = machine.transition(machine.initialState, 'TO_TWO');
      expect(changedState.changed).toBe(true);
    });

    it('normal state transitions should be changed', () => {
      const twoState = machine.transition(machine.initialState, 'TO_TWO');
      const changedState = machine.transition(twoState, 'FOO_EVENT');
      expect(changedState.changed).toBe(true);
    });

    it('normal state transitions with unknown event should be unchanged', () => {
      const twoState = machine.transition(machine.initialState, 'TO_TWO');
      const changedState = machine.transition(twoState, 'UNKNOWN_EVENT');
      expect(changedState.changed).toBe(false);
    });

    it('should report entering a final state as changed', () => {
      const finalMachine = Machine({
        id: 'final',
        initial: 'one',
        states: {
          one: {
            on: {
              DONE: 'two'
            }
          },

          two: {
            type: 'final'
          }
        }
      });

      const twoState = finalMachine.transition('one', 'DONE');

      expect(twoState.changed).toBe(true);
    });

    it('should report any internal transition assignments as changed', () => {
      const assignMachine = Machine<{ count: number }>({
        id: 'assign',
        initial: 'same',
        context: {
          count: 0
        },
        states: {
          same: {
            on: {
              EVENT: {
                actions: assign({ count: ctx => ctx.count + 1 })
              }
            }
          }
        }
      });

      const { initialState } = assignMachine;
      const changedState = assignMachine.transition(initialState, 'EVENT');
      expect(changedState.changed).toBe(true);
      expect(initialState.value).toEqual(changedState.value);
    });

    it('should not escape targetless child state nodes', () => {
      const toggleMachine = Machine({
        id: 'input',
        context: { value: '' },
        type: 'parallel',
        states: {
          edit: {
            on: {
              CHANGE: {
                actions: assign({
                  value: (_, e) => {
                    return e.value;
                  }
                })
              }
            }
          },
          validity: {
            initial: 'invalid',
            states: {
              invalid: {},
              valid: {}
            },
            on: {
              CHANGE: [
                { target: '.valid', cond: () => true },
                { target: '.invalid' }
              ]
            }
          }
        }
      });

      const nextState = toggleMachine.transition(toggleMachine.initialState, {
        type: 'CHANGE',
        value: 'whatever'
      });

      expect(nextState.changed).toBe(true);
      expect(nextState.value).toEqual({
        edit: {},
        validity: 'valid'
      });
    });
  });

  describe('.nextEvents', () => {
    it('returns the next possible events for the current state', () => {
      expect(machine.initialState.nextEvents.sort()).toEqual([
        'EXTERNAL',
        'INERT',
        'INTERNAL',
        'MACHINE_EVENT',
        'TO_THREE',
        'TO_TWO'
      ]);

      expect(
        machine.transition(machine.initialState, 'TO_TWO').nextEvents.sort()
      ).toEqual(['DEEP_EVENT', 'FOO_EVENT', 'MACHINE_EVENT']);

      expect(
        machine.transition(machine.initialState, 'TO_THREE').nextEvents.sort()
      ).toEqual(['MACHINE_EVENT', 'P31', 'P32', 'THREE_EVENT']);
    });

    it('returns events when transitioned from StateValue', () => {
      const A = machine.transition(machine.initialState, 'TO_THREE');
      const B = machine.transition(A.value, 'TO_THREE');

      expect(B.nextEvents.sort()).toEqual([
        'MACHINE_EVENT',
        'P31',
        'P32',
        'THREE_EVENT'
      ]);
    });

    it('returns no next events if there are none', () => {
      const noEventsMachine = Machine({
        id: 'no-events',
        initial: 'idle',
        states: {
          idle: {
            on: {}
          }
        }
      });

      expect(noEventsMachine.initialState.nextEvents).toEqual([]);
    });
  });

  describe('State.create()', () => {
    it('should be able to create a state from a JSON config', () => {
      const { initialState } = machine;
      const jsonInitialState = JSON.parse(JSON.stringify(initialState));

      const stateFromConfig = State.create<any>(jsonInitialState);

      expect(machine.transition(stateFromConfig, 'TO_TWO').value).toEqual({
        two: { deep: 'foo' }
      });
    });
  });

  describe('State.inert()', () => {
    it('should create an inert instance of the given State', () => {
      const { initialState } = machine;

      expect(State.inert(initialState, undefined).actions).toEqual([]);
    });

    it('should create an inert instance of the given stateValue and context', () => {
      const { initialState } = machine;
      const inertState = State.inert(initialState.value, { foo: 'bar' });

      expect(inertState.actions).toEqual([]);
      expect(inertState.context).toEqual({ foo: 'bar' });
    });

    it('should preserve the given State if there are no actions', () => {
      const naturallyInertState = State.from('foo');

      expect(State.inert(naturallyInertState, undefined)).toEqual(naturallyInertState);
    });
  });

  describe('.event', () => {
    it('the .event prop should be the event (string) that caused the transition', () => {
      const { initialState } = machine;

      const nextState = machine.transition(initialState, 'TO_TWO');

      expect(nextState.event).toEqual({ type: 'TO_TWO' });
    });

    it('the .event prop should be the event (object) that caused the transition', () => {
      const { initialState } = machine;

      const nextState = machine.transition(initialState, {
        type: 'TO_TWO',
        foo: 'bar'
      });

      expect(nextState.event).toEqual({ type: 'TO_TWO', foo: 'bar' });
    });

    it('the .event prop should be the initial event for the initial state', () => {
      const { initialState } = machine;

      expect(initialState.event).toEqual(initEvent);
    });
  });

  describe('._event', () => {
    it('the ._event prop should be the SCXML event (string) that caused the transition', () => {
      const { initialState } = machine;

      const nextState = machine.transition(initialState, 'TO_TWO');

      expect(nextState._event).toEqual(toSCXMLEvent('TO_TWO'));
    });

    it('the ._event prop should be the SCXML event (object) that caused the transition', () => {
      const { initialState } = machine;

      const nextState = machine.transition(initialState, {
        type: 'TO_TWO',
        foo: 'bar'
      });

      expect(
        nextState._event
      ).toEqual(
        toSCXMLEvent({ type: 'TO_TWO', foo: 'bar' })
      );
    });

    it('the ._event prop should be the initial SCXML event for the initial state', () => {
      const { initialState } = machine;

      expect(initialState._event).toEqual(toSCXMLEvent(initEvent));
    });

    it('the ._event prop should be the SCXML event (SCXML metadata) that caused the transition', () => {
      const { initialState } = machine;

      const nextState = machine.transition(initialState, {
        type: 'TO_TWO',
        foo: 'bar',
        __scxml: toSCXMLEvent(
          {
            type: 'TO_TWO',
            foo: 'bar'
          },
          {
            sendid: 'test'
          }
        )
      });

      expect(
        nextState._event
      ).toEqual(
        toSCXMLEvent(
          { type: 'TO_TWO', foo: 'bar' },
          {
            sendid: 'test'
          }
        )
      );
    });
  });

  describe('State.prototype.matches', () => {
    it('should keep reference to state instance after destcurting', () => {
      const { initialState } = machine;
      const { matches } = initialState;

      expect(matches('one')).toBe(true);
    });
  });

  describe('State.prototype.toStrings', () => {
    it('should return all state paths as strings', () => {
      const twoState = machine.transition('one', 'TO_TWO');

      expect(twoState.toStrings()).toEqual([
        'two',
        'two.deep',
        'two.deep.foo'
      ]);
    });

    it('should keep reference to state instance after destructuring', () => {
      const { initialState } = machine;
      const { toStrings } = initialState;

      expect(toStrings()).toEqual(['one']);
    });
  });
});
