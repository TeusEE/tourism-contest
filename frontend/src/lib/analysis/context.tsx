"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import {
  ApiClientError,
  requestAnalysis,
  toTravelPlanRequest,
} from "@/lib/api/client";
import type { TravelPlanAnalysisResponse } from "@/lib/api/contracts";
import type { ApiErrorState } from "@/lib/api/errors";
import { cancelledError } from "@/lib/api/errors";

import {
  hasValidationErrors,
  localDateString,
  type AnalysisInput,
  type ValidationErrors,
  validateAnalysisInput,
} from "./validation";

export type AnalysisPhase =
  "idle" | "loading" | "success" | "error" | "cancelled";

export interface AnalysisState {
  input: AnalysisInput;
  submittedInput: AnalysisInput | null;
  activeRequestId: string | null;
  phase: AnalysisPhase;
  result: TravelPlanAnalysisResponse | null;
  error: ApiErrorState | null;
  validationErrors: ValidationErrors;
}

export const initialAnalysisInput: AnalysisInput = {
  travelDate: localDateString(1),
  origin: "",
  destination: "",
  departureTime: "",
  eventKeywords: [],
};

export const initialAnalysisState: AnalysisState = {
  input: initialAnalysisInput,
  submittedInput: null,
  activeRequestId: null,
  phase: "idle",
  result: null,
  error: null,
  validationErrors: {},
};

export type AnalysisAction =
  | { type: "input"; patch: Partial<AnalysisInput> }
  | { type: "start"; input: AnalysisInput; requestId: string }
  | { type: "success"; requestId: string; result: TravelPlanAnalysisResponse }
  | { type: "failure"; requestId: string; error: ApiErrorState }
  | { type: "validation"; errors: ValidationErrors }
  | { type: "cancelled"; requestId: string }
  | { type: "reset" };

export function analysisReducer(
  state: AnalysisState,
  action: AnalysisAction,
): AnalysisState {
  switch (action.type) {
    case "input":
      if (state.phase === "loading") return state;
      return {
        ...state,
        input: { ...state.input, ...action.patch },
        phase: "idle",
        error: null,
        validationErrors: {},
      };
    case "start":
      if (state.phase === "loading") return state;
      return {
        ...state,
        input: cloneInput(action.input),
        submittedInput: cloneInput(action.input),
        activeRequestId: action.requestId,
        phase: "loading",
        result: null,
        error: null,
        validationErrors: {},
      };
    case "success":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        activeRequestId: null,
        phase: "success",
        result: action.result,
        error: null,
      };
    case "failure":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        activeRequestId: null,
        phase: "error",
        result: null,
        error: action.error,
      };
    case "validation":
      return {
        ...state,
        activeRequestId: null,
        phase: "error",
        result: null,
        error: null,
        validationErrors: action.errors,
      };
    case "cancelled":
      if (
        state.phase !== "loading" ||
        state.activeRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        activeRequestId: null,
        phase: "cancelled",
        result: null,
        error: cancelledError(),
      };
    case "reset":
      return initialAnalysisState;
  }
}

interface AnalysisContextValue {
  state: AnalysisState;
  updateInput: (patch: Partial<AnalysisInput>) => void;
  toggleKeyword: (keyword: string) => void;
  submitAnalysis: (input?: AnalysisInput) => Promise<boolean>;
  retryAnalysis: () => Promise<boolean>;
  startAnalysis: (input?: AnalysisInput) => string;
  completeAnalysis: (
    requestId: string,
    result: TravelPlanAnalysisResponse,
  ) => void;
  failAnalysis: (requestId: string, error: ApiErrorState) => void;
  setValidationErrors: (errors: ValidationErrors) => void;
  cancel: (requestId?: string) => void;
  reset: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analysisReducer, initialAnalysisState);
  const requestRef = useRef<{
    requestId: string;
    controller: AbortController;
  } | null>(null);

  const updateInput = useCallback((patch: Partial<AnalysisInput>) => {
    dispatch({ type: "input", patch });
  }, []);

  const toggleKeyword = useCallback(
    (keyword: string) => {
      const keywords = state.input.eventKeywords.includes(keyword)
        ? state.input.eventKeywords.filter((value) => value !== keyword)
        : [...state.input.eventKeywords, keyword];
      dispatch({ type: "input", patch: { eventKeywords: keywords } });
    },
    [state.input.eventKeywords],
  );

  const executeAnalysis = useCallback(
    async (input: AnalysisInput): Promise<boolean> => {
      if (requestRef.current || state.phase === "loading") return false;
      const validationErrors = validateAnalysisInput(input);
      if (hasValidationErrors(validationErrors)) {
        dispatch({ type: "validation", errors: validationErrors });
        return false;
      }

      const requestId = createRequestId();
      const controller = new AbortController();
      requestRef.current = { requestId, controller };
      dispatch({
        type: "start",
        input: cloneInput(input),
        requestId,
      });

      try {
        const result = await requestAnalysis(toTravelPlanRequest(input), {
          signal: controller.signal,
        });
        if (requestRef.current?.requestId !== requestId) return false;
        dispatch({ type: "success", requestId, result });
        return true;
      } catch (error) {
        if (requestRef.current?.requestId !== requestId) return false;
        const apiError =
          error instanceof ApiClientError ? error.state : networkErrorState();
        if (apiError.kind === "cancelled") {
          dispatch({ type: "cancelled", requestId });
        } else {
          dispatch({ type: "failure", requestId, error: apiError });
        }
        return false;
      } finally {
        if (requestRef.current?.requestId === requestId) {
          requestRef.current = null;
        }
      }
    },
    [state.phase],
  );

  const submitAnalysis = useCallback(
    (input = state.input) => executeAnalysis(input),
    [executeAnalysis, state.input],
  );

  const retryAnalysis = useCallback(
    () => executeAnalysis(state.submittedInput ?? state.input),
    [executeAnalysis, state.input, state.submittedInput],
  );

  const startAnalysis = useCallback(
    (input = state.input) => {
      if (state.phase === "loading" && state.activeRequestId) {
        return state.activeRequestId;
      }
      const requestId = createRequestId();
      dispatch({ type: "start", input, requestId });
      return requestId;
    },
    [state.activeRequestId, state.input, state.phase],
  );

  const completeAnalysis = useCallback(
    (requestId: string, result: TravelPlanAnalysisResponse) => {
      dispatch({ type: "success", requestId, result });
    },
    [],
  );

  const failAnalysis = useCallback(
    (requestId: string, error: ApiErrorState) => {
      dispatch({ type: "failure", requestId, error });
    },
    [],
  );

  const setValidationErrors = useCallback((errors: ValidationErrors) => {
    dispatch({ type: "validation", errors });
  }, []);

  const cancel = useCallback(
    (requestId = state.activeRequestId ?? "") => {
      const current = requestRef.current;
      if (current && (!requestId || current.requestId === requestId)) {
        requestRef.current = null;
        current.controller.abort();
      }
      if (state.phase === "loading" && requestId) {
        dispatch({ type: "cancelled", requestId });
      }
    },
    [state.activeRequestId, state.phase],
  );

  const reset = useCallback(() => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  const value = useMemo(
    () => ({
      state,
      updateInput,
      toggleKeyword,
      submitAnalysis,
      retryAnalysis,
      startAnalysis,
      completeAnalysis,
      failAnalysis,
      setValidationErrors,
      cancel,
      reset,
    }),
    [
      state,
      updateInput,
      toggleKeyword,
      submitAnalysis,
      retryAnalysis,
      startAnalysis,
      completeAnalysis,
      failAnalysis,
      setValidationErrors,
      cancel,
      reset,
    ],
  );

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext);
  if (!context)
    throw new Error("useAnalysis must be used inside AnalysisProvider");
  return context;
}

function cloneInput(input: AnalysisInput): AnalysisInput {
  return { ...input, eventKeywords: [...input.eventKeywords] };
}

let requestSequence = 0;

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  requestSequence += 1;
  return `analysis-${Date.now()}-${requestSequence}`;
}

function networkErrorState(): ApiErrorState {
  return {
    kind: "network",
    message: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
    status: null,
    code: null,
    requestId: null,
    fields: [],
  };
}
