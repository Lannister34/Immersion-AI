import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import {
  RuntimeBinaryMissingError,
  RuntimeInstallError,
  RuntimeModelNotFoundError,
  RuntimeProjectorNotFoundError,
} from '../../application/runtime-errors.js';
import { PathPickerUnsupportedError } from '../../infrastructure/directory-picker-invocation.js';

export const runtimeProblems: ProblemTable = createProblemTable(
  problemFor(RuntimeModelNotFoundError, (error) => problem(400, 'validation_error', error.message)),
  problemFor(RuntimeProjectorNotFoundError, (error) => problem(400, 'validation_error', error.message)),
  problemFor(RuntimeBinaryMissingError, (error) => problem(409, 'runtime_unavailable', error.message)),
  problemFor(RuntimeInstallError, (error) => problem(502, 'runtime_install_failed', error.message)),
  problemFor(PathPickerUnsupportedError, () =>
    problem(
      501,
      'directory_picker_unsupported',
      'Системный диалог выбора каталога недоступен на этой платформе — введите путь вручную.',
    ),
  ),
);
