#!/usr/bin/env python3
"""Gowun Dodum 폰트를 앱에서 실제로 쓰는 글자만 남겨 woff2 로 서브셋한다.

완전 오프라인(외부 CDN 금지) 요구사항을 만족하기 위해 폰트를 리포에 번들한다.
원본 ttf 전체(약 7MB)를 커밋하지 않고, 사용 글자만 담은 경량 woff2(수십 KB)만 커밋한다.

사용법:
    1) 원본 폰트 내려받기 (Google Fonts, OFL 라이선스):
       curl -L -o scripts/GowunDodum-source.ttf \
         "https://fonts.gstatic.com/s/gowundodum/v12/3Jn5SD_00GqwlBnWc1TUJF0F.ttf"
    2) python3 scripts/subset_font.py

동작:
    - src/ 아래 모든 텍스트 파일을 스캔해 사용된 한글/ASCII 글자 집합을 수집
    - 자주 쓰는 문장부호를 추가
    - pyftsubset(fonttools) 로 woff2 서브셋 생성
      → src/assets/fonts/GowunDodum-subset.woff2

콘텐츠(단어/협정문/UI 문구)를 바꾸면 이 스크립트를 다시 실행해 폰트를 갱신한다.
"""
import os
import sys
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "src")
SOURCE_TTF = os.path.join(ROOT, "scripts", "GowunDodum-source.ttf")
OUT_WOFF2 = os.path.join(ROOT, "src", "assets", "fonts", "GowunDodum-subset.woff2")

# 동적으로 스캔되지 않을 수 있는 안전 글자(부호/숫자/영문)
EXTRA = set(
    " !\"#$%&'()*+,-./0123456789:;<=>?@"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
    "abcdefghijklmnopqrstuvwxyz{|}~"
    "·…“”‘’—～·「」『』"
)

TEXT_EXT = (".ts", ".tsx", ".css", ".html")


def collect_chars() -> set[str]:
    chars: set[str] = set(EXTRA)
    for dirpath, _dirs, files in os.walk(SRC_DIR):
        for fn in files:
            if fn.endswith(TEXT_EXT):
                with open(os.path.join(dirpath, fn), encoding="utf-8") as f:
                    for ch in f.read():
                        # 한글 음절/자모 + 기타 표시용 문자
                        if "가" <= ch <= "힣" or "㄰" <= ch <= "㆏":
                            chars.add(ch)
    return chars


def main() -> int:
    if not os.path.exists(SOURCE_TTF):
        print(f"[에러] 원본 폰트가 없습니다: {SOURCE_TTF}", file=sys.stderr)
        print("README '폰트 서브셋' 절차를 참고해 원본 ttf 를 내려받으세요.", file=sys.stderr)
        return 1

    chars = collect_chars()
    unicodes = ",".join(f"U+{ord(c):04X}" for c in sorted(chars))
    os.makedirs(os.path.dirname(OUT_WOFF2), exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        SOURCE_TTF,
        f"--unicodes={unicodes}",
        "--flavor=woff2",
        "--layout-features=*",
        f"--output-file={OUT_WOFF2}",
    ]
    print(f"[정보] 글자 {len(chars)}자 서브셋 → {OUT_WOFF2}")
    result = subprocess.run(cmd)
    if result.returncode == 0:
        size = os.path.getsize(OUT_WOFF2)
        print(f"[완료] {OUT_WOFF2} ({size // 1024} KB)")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
