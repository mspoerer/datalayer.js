import { test } from 'tap';
import EventQueue from './queue';

// sample subscriber used for testing event broadcast
class EventSubscriber {
  constructor(id) {
    this.id = id;
    this.caughtEvents = [];
  }
  handleEvent(name, data) {
    this.caughtEvents.push([name, data]);
  }
}

// test cases

test('should create a new EventQueue', (t) => {
  const queue = new EventQueue();

  t.ok(queue instanceof EventQueue);

  t.end();
});

test('should properly subscribe a new subscriber', (t) => {
  const queue = new EventQueue();
  const subscriber = new EventSubscriber();

  queue.subscribe(subscriber);

  t.equal(queue.subscribers[0], subscriber, 'queue should contain given subscriber');
  t.end();
});

test('should throw an error if trying to subscribe object without handleEvent method', (t) => {
  const queue = new EventQueue();

  t.throws(() => queue.subscribe({}), 'subscriber has no handleEvent method');

  t.end();
});

test('should broadcast a single event to subscribers', (t) => {
  const queue = new EventQueue();
  const subscriber = new EventSubscriber();

  queue.subscribe(subscriber);
  queue.broadcastEvent('test', { foo: 123 });

  t.equal(subscriber.caughtEvents.length, 1, 'should have caught one event');
  t.deepEqual(subscriber.caughtEvents[0], ['test', { foo: 123 }], 'event 1 should contain expected data');
  t.end();
});

test('should broadcast event history to a newly added subscriber when receiveHistory is true', (t) => {
  const queue = new EventQueue();
  const subscriber = new EventSubscriber();

  queue.broadcastEvent('test', { foo: 123 });
  queue.broadcastEvent('test2', { foo: 123 });
  queue.subscribe(subscriber, true);

  t.equal(subscriber.caughtEvents.length, 2, 'should have caught one event');
  t.deepEqual(subscriber.caughtEvents[0], ['test', { foo: 123 }], 'event 1 should contain expected data');
  t.deepEqual(subscriber.caughtEvents[1], ['test2', { foo: 123 }], 'event 1 should contain expected data');
  t.end();
});
