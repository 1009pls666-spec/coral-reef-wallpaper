#!/bin/bash
set -euo pipefail

APP_NAME="CoralReefWallpaper.app"
UNATTENDED=false
if [[ "${1:-}" == "--unattended" ]]; then UNATTENDED=true; fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_APP="${SCRIPT_DIR}/${APP_NAME}"
TARGET_DIR="${HOME}/Applications"
TARGET_APP="${TARGET_DIR}/${APP_NAME}"

finish() {
  if [[ "${UNATTENDED}" == "true" ]]; then return; fi
  printf '\n설치 창을 닫으려면 Return 키를 누르세요.\n'
  read -r _
}
trap finish EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '이 설치 파일은 Mac 전용입니다.\n' >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  printf '현재 파일은 Apple Silicon(M1 이상) Mac 전용입니다.\n' >&2
  exit 1
fi
if [[ ! -d "${SOURCE_APP}" ]]; then
  printf '설치 앱을 찾지 못했습니다: %s\n' "${SOURCE_APP}" >&2
  exit 1
fi

printf '나의 산호초 바탕화면을 설치하고 있습니다…\n'
mkdir -p "${TARGET_DIR}"
pkill -x CoralReefWallpaper 2>/dev/null || true
sleep 1
rm -rf "${TARGET_APP}"
/usr/bin/ditto "${SOURCE_APP}" "${TARGET_APP}"
/usr/bin/xattr -dr com.apple.quarantine "${TARGET_APP}" 2>/dev/null || true

if ! /usr/bin/codesign --verify --deep --strict "${TARGET_APP}" 2>/dev/null; then
  printf '앱 무결성 확인에 실패했습니다. 파일을 다시 다운로드해 주세요.\n' >&2
  exit 1
fi

/usr/bin/open "${TARGET_APP}" --args --install-wallpaper
printf '\n설치 완료! 바탕화면이 실행되었고 로그인 시 자동으로 시작됩니다.\n'
printf '편집: Command + Shift + E\n'
printf '일시정지/재생: Command + Shift + Space\n'
