#!/usr/bin/env bash
# Discord/Telegram 알림 유틸리티.
# deploy.yml의 각 스텝에서 `source .github/scripts/notify.sh` 후 함수만 호출한다.
#
# 필요 환경변수(호출하는 워크플로 스텝의 env:에서 주입):
#   DISCORD_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
#
# 모든 페이로드는 jq -n으로 조립한다 — 문자열 직접 삽입 방식은 값에 따옴표/개행이
# 섞이면 JSON이 깨지거나(전송 실패) 최악의 경우 페이로드 구조가 의도와 달라질 수 있어
# (JSON 인젝션류 문제) 여기서는 쓰지 않는다.

set -euo pipefail

# 호출부에서 "...\n..."처럼 큰따옴표 문자열에 \n을 그대로 적어도 되게 해주는 헬퍼.
# bash의 일반 큰따옴표 문자열은 \n을 개행으로 해석하지 않고 backslash+n 두 글자
# 그대로 두기 때문에, 여기서 실제 개행 문자로 한 번에 치환한다.
_expand_newlines() {
  printf '%b' "$1"
}

discord_embed() {
  local title="$1" desc desc_raw="$2" color="$3"
  desc="$(_expand_newlines "$desc_raw")"
  local payload
  payload=$(jq -n --arg title "$title" --arg desc "$desc" --argjson color "$color" \
    '{embeds: [{title: $title, description: $desc, color: $color}]}')
  curl -sS -o /dev/null -w "discord_embed -> %{http_code}\n" \
    -H "Content-Type: application/json" -X POST -d "$payload" "$DISCORD_WEBHOOK_URL"
}

discord_file() {
  local filepath="$1"
  curl -sS -o /dev/null -w "discord_file -> %{http_code}\n" \
    -F "files[0]=@${filepath}" "$DISCORD_WEBHOOK_URL"
}

telegram_text() {
  local text text_raw="$1" parse_mode="${2:-Markdown}"
  text="$(_expand_newlines "$text_raw")"
  local payload
  payload=$(jq -n --arg chat_id "$TELEGRAM_CHAT_ID" --arg text "$text" --arg parse_mode "$parse_mode" \
    '{chat_id: $chat_id, text: $text, parse_mode: $parse_mode}')
  curl -sS -o /dev/null -w "telegram_text -> %{http_code}\n" \
    -H "Content-Type: application/json" -X POST -d "$payload" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
}
