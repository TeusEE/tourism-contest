import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ApiClientError, requestAnalysis, toTravelPlanRequest } from '@/src/api/client';
import type { TravelPlanAnalysisResponse } from '@/src/api/contracts';

import {
  hasValidationErrors,
  localDateString,
  type AnalysisInput,
  type ValidationErrors,
  validateAnalysisInput,
} from './validation';

export type AnalysisPhase = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';

export interface AnalysisState {
  input: AnalysisInput;
  submittedInput: AnalysisInput | null;
  phase: AnalysisPhase;
  result: TravelPlanAnalysisResponse | null;
  error: ApiClientError | null;
  validationErrors: ValidationErrors;
  appState: AppStateStatus;
}

export const initialAnalysisInput: AnalysisInput = {
  travelDate: localDateString(1),
  origin: '',
  destination: '',
  departureTime: '',
  eventKeywords: [],
};

const initialState: AnalysisState = {
  input: initialAnalysisInput,
  submittedInput: null,
  phase: 'idle',
  result: null,
  error: null,
  validationErrors: {},
  appState: AppState.currentState,
};

type Action =
  | { type: 'input'; patch: Partial<AnalysisInput> }
  | { type: 'start'; input: AnalysisInput }
  | { type: 'success'; result: TravelPlanAnalysisResponse }
  | { type: 'failure'; error: ApiClientError }
  | { type: 'validation'; errors: ValidationErrors }
  | { type: 'cancelled' }
  | { type: 'reset' }
  | { type: 'app-state'; value: AppStateStatus };

export function analysisReducer(state: AnalysisState, action: Action): AnalysisState {
  switch (action.type) {
    case 'input':
      return {
        ...state,
        input: { ...state.input, ...action.patch },
        phase: state.phase === 'loading' ? state.phase : 'idle',
        error: null,
        validationErrors: {},
      };
    case 'start':
      return {
        ...state,
        input: action.input,
        submittedInput: action.input,
        phase: 'loading',
        result: null,
        error: null,
        validationErrors: {},
      };
    case 'success':
      return { ...state, phase: 'success', result: action.result, error: null };
    case 'failure':
      return { ...state, phase: 'error', result: null, error: action.error };
    case 'validation':
      return { ...state, phase: 'error', error: null, validationErrors: action.errors };
    case 'cancelled':
      return {
        ...state,
        phase: 'cancelled',
        result: null,
        error: new ApiClientError('cancelled', '분석 요청을 취소했습니다.'),
      };
    case 'reset':
      return { ...initialState, appState: state.appState };
    case 'app-state':
      return { ...state, appState: action.value };
  }
}

interface AnalysisContextValue {
  state: AnalysisState;
  updateInput: (patch: Partial<AnalysisInput>) => void;
  toggleKeyword: (keyword: string) => void;
  submit: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  cancel: () => void;
  reset: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analysisReducer, initialState);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const nextRequestId = useRef(0);

  const execute = useCallback(async (input: AnalysisInput): Promise<boolean> => {
    if (requestRef.current) return false;
    const validationErrors = validateAnalysisInput(input);
    if (hasValidationErrors(validationErrors)) {
      dispatch({ type: 'validation', errors: validationErrors });
      return false;
    }

    const id = ++nextRequestId.current;
    const controller = new AbortController();
    requestRef.current = { id, controller };
    dispatch({ type: 'start', input: { ...input, eventKeywords: [...input.eventKeywords] } });
    try {
      const result = await requestAnalysis(toTravelPlanRequest(input), {
        signal: controller.signal,
      });
      if (requestRef.current?.id !== id) return false;
      dispatch({ type: 'success', result });
      return true;
    } catch (error) {
      if (requestRef.current?.id !== id) return false;
      if (error instanceof ApiClientError && error.kind === 'cancelled') {
        dispatch({ type: 'cancelled' });
      } else {
        dispatch({
          type: 'failure',
          error:
            error instanceof ApiClientError
              ? error
              : new ApiClientError('network', '서버에 연결하지 못했습니다.'),
        });
      }
      return false;
    } finally {
      if (requestRef.current?.id === id) requestRef.current = null;
    }
  }, []);

  const updateInput = useCallback((patch: Partial<AnalysisInput>) => {
    if (!requestRef.current) dispatch({ type: 'input', patch });
  }, []);

  const toggleKeyword = useCallback(
    (keyword: string) => {
      if (requestRef.current) return;
      const keywords = state.input.eventKeywords.includes(keyword)
        ? state.input.eventKeywords.filter((value) => value !== keyword)
        : [...state.input.eventKeywords, keyword];
      dispatch({ type: 'input', patch: { eventKeywords: keywords } });
    },
    [state.input.eventKeywords],
  );

  const submit = useCallback(() => execute(state.input), [execute, state.input]);
  const retry = useCallback(
    () => execute(state.submittedInput ?? state.input),
    [execute, state.input, state.submittedInput],
  );
  const cancel = useCallback(() => {
    const current = requestRef.current;
    if (!current) return;
    requestRef.current = null;
    current.controller.abort();
    dispatch({ type: 'cancelled' });
  }, []);
  const reset = useCallback(() => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (value) => {
      dispatch({ type: 'app-state', value });
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo(
    () => ({ state, updateInput, toggleKeyword, submit, retry, cancel, reset }),
    [state, updateInput, toggleKeyword, submit, retry, cancel, reset],
  );
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return context;
}
