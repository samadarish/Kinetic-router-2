import { describe, expect, it } from 'vitest';
import { reportedModelStatus } from './playground-status';

describe('reported channel status', () => {
  const channel = { id: '1', name: 'Channel', provider: 'openai', primaryModel: 'chat', primaryStatus: 'healthy' };
  it('reports only an exact unambiguous model match', () => {
    expect(reportedModelStatus([channel], 'chat')).toBe('Operational');
    expect(reportedModelStatus([channel], 'chat-large')).toBeUndefined();
    expect(reportedModelStatus([channel, { ...channel, id: '2' }], 'chat')).toBeUndefined();
    expect(reportedModelStatus(undefined, 'chat')).toBeUndefined();
  });
  it('does not invent positive status from unknown labels', () => {
    expect(reportedModelStatus([{ ...channel, primaryStatus: 'unknown' }], 'chat')).toBeUndefined();
    expect(reportedModelStatus([{ ...channel, primaryStatus: 'down' }], 'chat')).toBe('Unavailable');
  });
});
