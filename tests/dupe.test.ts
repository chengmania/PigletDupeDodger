import { describe, expect, test } from 'bun:test';
import { baseCall, checkDupe, normalizeCall } from '../src/shared/dupe.ts';
import { makeConfig, makeQso } from './fixtures.ts';

describe('normalizeCall', () => {
  test('trims and uppercases', () => {
    expect(normalizeCall(' w1abc ')).toBe('W1ABC');
  });
});

describe('baseCall', () => {
  test('strips /P', () => expect(baseCall('W1ABC/P')).toBe('W1ABC'));
  test('strips /M', () => expect(baseCall('w1abc/M')).toBe('W1ABC'));
  test('strips /QRP', () => expect(baseCall('W1ABC/QRP')).toBe('W1ABC'));
  test('strips /AG', () => expect(baseCall('W1ABC/AG')).toBe('W1ABC'));
  test('strips /MM', () => expect(baseCall('W1ABC/MM')).toBe('W1ABC'));
  test('picks the longest remaining segment for compound calls', () => {
    expect(baseCall('KH6/W1ABCDEF')).toBe('W1ABCDEF');
  });
});

describe('checkDupe', () => {
  const config = makeConfig();

  test('new call, empty log', () => {
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' }, [], config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toEqual([]);
  });

  test('exact key already logged is a dupe', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' }, log, config);
    expect(result.status).toBe('DUPE');
    expect(result.exactDupe).toBeDefined();
  });

  test('same call, different band -> NEW with workedElsewhere', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' })];
    const result = checkDupe({ call: 'W1ABC', band: '40m', mode: 'PH', station: 'MAIN' }, log, config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toHaveLength(1);
    expect(result.workedElsewhere[0]?.band).toBe('20m');
  });

  test('same call, different mode -> NEW with workedElsewhere', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'CW', station: 'MAIN' }, log, config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toHaveLength(1);
  });

  test('MAIN vs GOTA station isolation -- not a dupe across stations', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'GOTA' }, log, config);
    expect(result.status).toBe('NEW');
  });

  test('portable suffix collapses to same base for dupe purposes', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' })];
    const result = checkDupe({ call: 'W1ABC/P', band: '20m', mode: 'PH', station: 'MAIN' }, log, config);
    expect(result.status).toBe('DUPE');
  });

  test('whitespace/case collapse still matches', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' })];
    const result = checkDupe({ call: ' w1abc ', band: '20m', mode: 'PH', station: 'MAIN' }, log, config);
    expect(result.status).toBe('DUPE');
  });

  test('soft-deleted QSO is ignored for both dupe and workedElsewhere', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN', deleted: true })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'PH', station: 'MAIN' }, log, config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toEqual([]);
  });

  test('blocks own club call (Rule 6.1), never overridable via status', () => {
    const result = checkDupe({ call: config.clubCall, band: '20m', mode: 'PH', station: 'MAIN' }, [], config);
    expect(result.status).toBe('BLOCKED_SELF');
  });

  test('blocks own GOTA call', () => {
    const result = checkDupe({ call: config.gotaCall!, band: '20m', mode: 'PH', station: 'MAIN' }, [], config);
    expect(result.status).toBe('BLOCKED_SELF');
  });

  test('satellite single-channel-FM limit blocks a second QSO on the same satellite by a different call', () => {
    const log = [
      makeQso({ call: 'W2XYZ', band: 'SAT', mode: 'PH', station: 'MAIN', satelliteName: 'SO-50', satelliteSingleChannelFm: true }),
    ];
    const result = checkDupe(
      { call: 'W3DEF', band: 'SAT', mode: 'PH', station: 'MAIN', satelliteName: 'SO-50', satelliteSingleChannelFm: true },
      log,
      config,
    );
    expect(result.status).toBe('BLOCKED_SAT_LIMIT');
  });

  test('linear-transponder satellite is not subject to the single-channel-FM limit', () => {
    const log = [
      makeQso({ call: 'W2XYZ', band: 'SAT', mode: 'PH', station: 'MAIN', satelliteName: 'AO-91', satelliteSingleChannelFm: false }),
    ];
    const result = checkDupe(
      { call: 'W3DEF', band: 'SAT', mode: 'PH', station: 'MAIN', satelliteName: 'AO-91', satelliteSingleChannelFm: false },
      log,
      config,
    );
    expect(result.status).toBe('NEW');
  });

  test('repeat call on SAT band via a different satellite is still an ordinary dupe', () => {
    const log = [
      makeQso({ call: 'W1ABC', band: 'SAT', mode: 'PH', station: 'MAIN', satelliteName: 'SO-50', satelliteSingleChannelFm: true }),
    ];
    const result = checkDupe(
      { call: 'W1ABC', band: 'SAT', mode: 'PH', station: 'MAIN', satelliteName: 'AO-91', satelliteSingleChannelFm: false },
      log,
      config,
    );
    expect(result.status).toBe('DUPE');
  });
});
