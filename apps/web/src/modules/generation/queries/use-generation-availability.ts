import { useQuery } from '@tanstack/react-query';

import {
  type GenerationAvailabilityViewModel,
  toGenerationAvailabilityViewModel,
} from '../view-models/generation-availability';
import { generationReadinessQueryOptions } from './generation-readiness-query';

export function useGenerationAvailability(): GenerationAvailabilityViewModel {
  const readinessQuery = useQuery(generationReadinessQueryOptions());

  return toGenerationAvailabilityViewModel({
    isError: readinessQuery.isError,
    isLoading: readinessQuery.isLoading,
    readiness: readinessQuery.data,
  });
}
