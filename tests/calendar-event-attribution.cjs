'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {fixture, settle} = require('./calendar/row9_ui_fixture.cjs');

test('event cards and both editor forms identify the creator and verified edit author', async () => {
  const f = fixture('events', {skipRender: true});
  try {
    const event = f.data.events.find(row => row.EventID === 'E1');
    Object.assign(event, {CreatedBy: 'admin', UpdatedBy: 'admin', LastMutationID: 'synthetic-event-save'});
    f.data.people.find(row => row.userAlias === 'publisher').displayName = 'Editor <sample>';
    f.w.fetch = async (url, options) => {
      assert.equal(url, '/api');
      assert.deepEqual(JSON.parse(options.body), {action: 'eventEditAuthor',
        payload: {eventId: event.EventID, operationId: event.LastMutationID}});
      return {ok: true, json: async () => ({ok: true, result: {userAlias: 'publisher'}})};
    };
    f.app.renderAll();
    assert.match(f.node('calendarHost').querySelector('[data-event-id="E1"]').textContent, /Created by Synthetic Admin/);
    f.app.setPage('weekly');
    assert.match(f.node('weeklyHost').querySelector('[data-event-id="E1"]').textContent, /Created by Synthetic Admin/);
    for (const open of [f.app.openEventModal, f.app.openParentModal]) {
      open(event);
      await settle();
      assert.match(f.node('modalHost').textContent, /Created by Synthetic Admin/);
      assert.equal(f.node('modalHost').querySelector('[data-event-editor]').textContent, 'Editor <sample>');
      assert.equal(f.node('modalHost').querySelector('sample'), null);
      f.app.closeModal(true);
    }
    event.CreatedBy = 'CONTACTS-BIRTHDAY-V1|private-source-id';
    event.LastMutationID = '';
    f.app.openEventModal(event);
    assert.match(f.node('modalHost').textContent, /Created by Contacts birthday import/);
    assert.doesNotMatch(f.node('modalHost').textContent, /private-source-id/);
    assert.equal(f.node('modalHost').querySelector('[data-event-editor]').textContent, 'Not recorded');
    f.app.closeModal(true);
    f.app.openEventModal(null);
    assert.doesNotMatch(f.node('modalHost').textContent, /Created by|Last event edit by/);
  } finally {
    f.close();
  }
});
