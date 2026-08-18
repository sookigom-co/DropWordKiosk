import { useCallback, useMemo, useReducer } from 'react';
import { NOUNS, ADJECTIVES, VERBS, findWord } from '../data/words';
import { composeSentence } from '../lib/sentence';

/** 화면(스텝) 정의 — 선형 흐름 + 인쇄 실패 분기(error) */
export const STEP_ORDER = [
  'start',
  'intro',
  'treaty',
  'step1Intro',
  'step1',
  'step2Intro',
  'step2',
  'step3Intro',
  'step3',
  'generating',
  'result',
  'printing',
  'done',
] as const;

export type Step = (typeof STEP_ORDER)[number] | 'error' | 'preview';

export interface KioskState {
  step: Step;
  nounId: string | null;
  adjectiveId: string | null;
  verbId: string | null;
}

const INITIAL: KioskState = {
  step: 'start',
  nounId: null,
  adjectiveId: null,
  verbId: null,
};

type Action =
  | { type: 'GO'; step: Step }
  | { type: 'NEXT' }
  | { type: 'SELECT_NOUN'; id: string }
  | { type: 'SELECT_ADJECTIVE'; id: string }
  | { type: 'SELECT_VERB'; id: string }
  | { type: 'RESET' };

function reducer(state: KioskState, action: Action): KioskState {
  switch (action.type) {
    case 'GO':
      return { ...state, step: action.step };
    case 'NEXT': {
      const idx = STEP_ORDER.indexOf(state.step as (typeof STEP_ORDER)[number]);
      if (idx < 0 || idx >= STEP_ORDER.length - 1) return state;
      return { ...state, step: STEP_ORDER[idx + 1] };
    }
    case 'SELECT_NOUN':
      return { ...state, nounId: action.id };
    case 'SELECT_ADJECTIVE':
      return { ...state, adjectiveId: action.id };
    case 'SELECT_VERB':
      return { ...state, verbId: action.id };
    case 'RESET':
      return { ...INITIAL };
    default:
      return state;
  }
}

export interface KioskApi extends KioskState {
  next: () => void;
  go: (step: Step) => void;
  reset: () => void;
  selectNoun: (id: string) => void;
  selectAdjective: (id: string) => void;
  selectVerb: (id: string) => void;
  /** 선택 완료된 세 단어로 조합한 완성 문장(선택 전이면 null) */
  sentence: string | null;
}

export function useKiosk(): KioskApi {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const next = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const go = useCallback((step: Step) => dispatch({ type: 'GO', step }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const selectNoun = useCallback((id: string) => dispatch({ type: 'SELECT_NOUN', id }), []);
  const selectAdjective = useCallback(
    (id: string) => dispatch({ type: 'SELECT_ADJECTIVE', id }),
    [],
  );
  const selectVerb = useCallback((id: string) => dispatch({ type: 'SELECT_VERB', id }), []);

  const sentence = useMemo(() => {
    const noun = state.nounId ? findWord(NOUNS, state.nounId) : undefined;
    const adjective = state.adjectiveId ? findWord(ADJECTIVES, state.adjectiveId) : undefined;
    const verb = state.verbId ? findWord(VERBS, state.verbId) : undefined;
    if (!noun || !adjective || !verb) return null;
    return composeSentence({ adjective: adjective.text, noun: noun.text, verb: verb.text });
  }, [state.nounId, state.adjectiveId, state.verbId]);

  return {
    ...state,
    next,
    go,
    reset,
    selectNoun,
    selectAdjective,
    selectVerb,
    sentence,
  };
}
