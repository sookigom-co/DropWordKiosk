// 한글 음절의 자음·모음(자모) 분리 타자기 효과 유틸.
//
// 목표: "우리는"을 입력할 때 실제 한글 IME(입력기)처럼 자모가 조합되는
//       중간 과정을 프레임 단위로 재현한다. (예: '' → ㅇ → 우 → 울 → 우리 → 우린 → 우리는)
//
// 외부 패키지 없이 유니코드 한글 음절 규칙만으로 구현한다(오프라인 키오스크 제약).
//   한글 음절 유니코드: 0xAC00(가) ~ 0xD7A3(힣)
//   음절 = 초성(19) × 중성(21) × 종성(28) 조합.

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

// 호환 자모(compatibility jamo) 문자 — 키보드 입력 단위로 사용한다.
const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const JUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
];
const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

// 복합 모음(중성): 인덱스 → [기본 모음 인덱스, 이어 입력하는 모음 키].
// 예) ㅘ(9) = ㅗ(8) + ㅏ.
const JUNG_COMPOUND: Record<number, [number, string]> = {
  9: [8, 'ㅏ'],
  10: [8, 'ㅐ'],
  11: [8, 'ㅣ'],
  14: [13, 'ㅓ'],
  15: [13, 'ㅔ'],
  16: [13, 'ㅣ'],
  19: [18, 'ㅣ'],
};

// 복합 받침(종성): 인덱스 → [기본 종성 인덱스, 이어 입력하는 자음 키].
// 예) ㄺ(9) = ㄹ(8) + ㄱ.
const JONG_COMPOUND: Record<number, [number, string]> = {
  3: [1, 'ㅅ'],
  5: [4, 'ㅈ'],
  6: [4, 'ㅎ'],
  9: [8, 'ㄱ'],
  10: [8, 'ㅁ'],
  11: [8, 'ㅂ'],
  12: [8, 'ㅅ'],
  13: [8, 'ㅌ'],
  14: [8, 'ㅍ'],
  15: [8, 'ㅎ'],
  18: [17, 'ㅅ'],
};

// 역방향 조회 테이블.
const CHO_INDEX: Record<string, number> = {};
CHO.forEach((c, i) => {
  CHO_INDEX[c] = i;
});
const JUNG_INDEX: Record<string, number> = {};
JUNG.forEach((c, i) => {
  JUNG_INDEX[c] = i;
});
// 단일 종성(자음 키 → 종성 인덱스). 복합 종성은 별도 조합으로 만든다.
const JONG_SINGLE_INDEX: Record<string, number> = {};
JONG.forEach((c, i) => {
  if (c && !JONG_COMPOUND[i]) JONG_SINGLE_INDEX[c] = i;
});
// 복합 종성 조합: `${기본종성}|${자음키}` → 복합 종성 인덱스.
const JONG_COMBINE: Record<string, number> = {};
Object.entries(JONG_COMPOUND).forEach(([idx, [base, ex]]) => {
  JONG_COMBINE[`${base}|${ex}`] = Number(idx);
});
// 복합 모음 조합: `${기본중성}|${모음키}` → 복합 중성 인덱스.
const JUNG_COMBINE: Record<string, number> = {};
Object.entries(JUNG_COMPOUND).forEach(([idx, [base, ex]]) => {
  JUNG_COMBINE[`${base}|${ex}`] = Number(idx);
});

function isHangulSyllable(code: number): boolean {
  return code >= HANGUL_BASE && code <= HANGUL_END;
}

/** 한글 음절 한 글자를 [초성, 중성, 종성] 호환 자모로 분해한다. 한글이 아니면 null. */
export function decompose(char: string): [string, string, string] | null {
  const code = char.charCodeAt(0);
  if (!isHangulSyllable(code)) return null;
  const s = code - HANGUL_BASE;
  const cho = Math.floor(s / (JUNG_COUNT * JONG_COUNT));
  const jung = Math.floor((s % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
  const jong = s % JONG_COUNT;
  return [CHO[cho], JUNG[jung], JONG[jong]];
}

type Kind = 'C' | 'V';
interface Key {
  kind: Kind;
  ch: string;
}

/** 한글 음절 한 글자를 키보드 입력 순서(자모 키 배열)로 분해한다. */
function keystrokesForSyllable(code: number): Key[] {
  const s = code - HANGUL_BASE;
  const cho = Math.floor(s / (JUNG_COUNT * JONG_COUNT));
  const jung = Math.floor((s % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
  const jong = s % JONG_COUNT;

  const keys: Key[] = [{ kind: 'C', ch: CHO[cho] }];

  const jungCompound = JUNG_COMPOUND[jung];
  if (jungCompound) {
    keys.push({ kind: 'V', ch: JUNG[jungCompound[0]] }, { kind: 'V', ch: jungCompound[1] });
  } else {
    keys.push({ kind: 'V', ch: JUNG[jung] });
  }

  if (jong > 0) {
    const jongCompound = JONG_COMPOUND[jong];
    if (jongCompound) {
      keys.push({ kind: 'C', ch: JONG[jongCompound[0]] }, { kind: 'C', ch: jongCompound[1] });
    } else {
      keys.push({ kind: 'C', ch: JONG[jong] });
    }
  }
  return keys;
}

interface Block {
  cho: number | null;
  jung: number | null;
  jong: number | null;
}

function emptyBlock(): Block {
  return { cho: null, jung: null, jong: null };
}

/** 조합 중인 블록을 화면 문자열로 렌더한다. */
function render(b: Block): string {
  if (b.cho !== null && b.jung !== null) {
    return String.fromCharCode(
      HANGUL_BASE + (b.cho * JUNG_COUNT + b.jung) * JONG_COUNT + (b.jong ?? 0),
    );
  }
  if (b.cho !== null) return CHO[b.cho];
  if (b.jung !== null) return JUNG[b.jung];
  return '';
}

/** 복합/단일 종성을 분해해 마지막 자음 하나를 다음 글자 초성으로 넘긴다. */
function jongDecompose(idx: number): { remain: number; moved: string } {
  const compound = JONG_COMPOUND[idx];
  if (compound) return { remain: compound[0], moved: compound[1] };
  return { remain: 0, moved: JONG[idx] };
}

/**
 * 텍스트를 자모 타자기 프레임 배열로 변환한다.
 * 반환 배열의 첫 원소는 빈 문자열(''), 마지막 원소는 완성된 전체 텍스트다.
 * 연속으로 동일한 프레임은 제거한다(불필요한 정지 방지).
 */
export function typingFrames(text: string): string[] {
  const frames: string[] = [''];
  let committed = '';
  let block = emptyBlock();

  const pushFrame = (str: string) => {
    if (frames[frames.length - 1] !== str) frames.push(str);
  };
  const commit = () => {
    committed += render(block);
    block = emptyBlock();
  };

  const processKey = (key: Key) => {
    if (key.kind === 'C') {
      const c = key.ch;
      if (block.cho === null) {
        block.cho = CHO_INDEX[c];
        return;
      }
      if (block.jung === null) {
        // 초성만 있는데 자음이 또 옴 → 앞 자음 확정 후 새 초성 시작.
        commit();
        block.cho = CHO_INDEX[c];
        return;
      }
      if (block.jong === null) {
        const ji = JONG_SINGLE_INDEX[c];
        if (ji !== undefined) block.jong = ji;
        else {
          commit();
          block.cho = CHO_INDEX[c];
        }
        return;
      }
      const combined = JONG_COMBINE[`${block.jong}|${c}`];
      if (combined !== undefined) block.jong = combined;
      else {
        commit();
        block.cho = CHO_INDEX[c];
      }
      return;
    }

    // 모음 입력.
    const v = key.ch;
    const vi = JUNG_INDEX[v];
    if (block.cho === null && block.jung === null) {
      block.jung = vi;
      return;
    }
    if (block.jung === null) {
      block.jung = vi;
      return;
    }
    if (block.jong === null) {
      const combined = JUNG_COMBINE[`${block.jung}|${v}`];
      if (combined !== undefined) block.jung = combined;
      else {
        commit();
        block.jung = vi;
      }
      return;
    }
    // 종성 보유 상태에서 모음 입력 → 종성이 다음 글자 초성으로 이동(IME 재조합).
    const { remain, moved } = jongDecompose(block.jong);
    block.jong = remain === 0 ? null : remain;
    commit();
    block.cho = CHO_INDEX[moved];
    block.jung = vi;
  };

  for (const char of text) {
    const code = char.charCodeAt(0);
    if (isHangulSyllable(code)) {
      for (const key of keystrokesForSyllable(code)) {
        processKey(key);
        pushFrame(committed + render(block));
      }
    } else {
      // 공백·문장부호·숫자 등은 조합 없이 그대로 붙인다.
      commit();
      committed += char;
      pushFrame(committed);
    }
  }

  return frames;
}
