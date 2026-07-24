import { pluralRu } from '../../../shared/lib/plural';
import type { AutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import { countSamplingOverrides, type InheritedSampling } from '../view-models/sampling-overrides';
import { SamplingOverridesFields } from './sampling-overrides-fields';
import { SaveErrorLine } from './save-error-line';

export interface SamplerParamsSectionProps {
  form: AutoSavedGenerationSettings;
  /** Значения, которые применятся без переопределений чата. */
  inherited: InheritedSampling | undefined;
}

export function SamplerParamsSection({ form, inherited }: SamplerParamsSectionProps) {
  const overrideCount = countSamplingOverrides(form.draft.sampling);

  return (
    <div className="col gap-8">
      <div className="between">
        <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
          Выключенный параметр берётся из пресета
        </span>
        <span className="muted mono" style={{ fontSize: 'var(--fz-2xs)' }}>
          {overrideCount > 0 ? pluralRu(overrideCount, ['поле', 'поля', 'полей']) : 'из пресета'}
        </span>
      </div>
      <SamplingOverridesFields
        disabled={false}
        draft={form.draft.sampling}
        errors={form.errors}
        inherited={inherited}
        onChange={form.setSampling}
      />
      <SaveErrorLine saveError={form.saveError} />
      {overrideCount > 0 ? (
        <button
          className="btn btn--xs"
          onClick={form.clearSamplingOverrides}
          style={{ alignSelf: 'flex-start' }}
          type="button"
        >
          Сбросить переопределения
        </button>
      ) : null}
    </div>
  );
}
