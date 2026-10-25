import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { ModelBindingNotFoundError } from '../../application/model-binding-mutations.js';
import { ReplyLimitExceedsContextError } from '../../application/reply-limit-exceeds-context-error.js';
import { LastSamplerPresetError, SamplerPresetNotFoundError } from '../../application/sampler-preset-mutations.js';

export const settingsProblems: ProblemTable = createProblemTable(
  problemFor(SamplerPresetNotFoundError, (error) => problem(404, 'sampler_preset_not_found', error.message)),
  problemFor(LastSamplerPresetError, (error) => problem(409, 'last_sampler_preset', error.message)),
  problemFor(ReplyLimitExceedsContextError, (error) => problem(400, 'reply_limit_exceeds_context', error.message)),
  problemFor(ModelBindingNotFoundError, (error) => problem(404, 'model_binding_not_found', error.message)),
);
