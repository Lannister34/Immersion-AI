import { describe, expect, it } from 'vitest';

import { getScenario, ScenarioNotFoundError } from './get-scenario.js';

describe('getScenario', () => {
  it('throws ScenarioNotFoundError for a missing id', async () => {
    const scenarioStore = { readScenarioDetail: () => Promise.resolve(null) };

    await expect(getScenario('Пропавший.json', { scenarioStore })).rejects.toBeInstanceOf(ScenarioNotFoundError);
  });
});
