#!/usr/bin/env bash
# Uploads a package to the Chrome Web Store (API v2) and submits it for review.
# Usage: publish-chrome.sh path/to/extension.zip
# Env: CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID CWS_EXTENSION_ID
set -euo pipefail

zip="${1:?usage: publish-chrome.sh extension.zip}"
for v in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID CWS_EXTENSION_ID; do
  if [ -z "${!v:-}" ]; then
    echo "::error::$v is not set in the extension-stores environment. See .github/scripts/PUBLISHING.md."
    exit 1
  fi
done

# Exchange the refresh token for an access token. Secrets go via stdin, not argv.
token_json=$(printf 'client_id=%s&client_secret=%s&refresh_token=%s&grant_type=refresh_token' \
    "$(jq -rn --arg v "$CWS_CLIENT_ID" '$v|@uri')" \
    "$(jq -rn --arg v "$CWS_CLIENT_SECRET" '$v|@uri')" \
    "$(jq -rn --arg v "$CWS_REFRESH_TOKEN" '$v|@uri')" \
  | curl -sS https://oauth2.googleapis.com/token --data @-)
token=$(jq -r '.access_token // empty' <<<"$token_json")
if [ -z "$token" ]; then
  echo "::error::Could not get a Google access token: $(jq -c '{error, error_description}' <<<"$token_json")"
  echo "If the error is invalid_grant, the refresh token expired or was revoked: create a new one (PUBLISHING.md)."
  exit 1
fi
echo "::add-mask::$token"

base="https://chromewebstore.googleapis.com"
item="publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID"
auth=(-H "Authorization: Bearer $token")

echo "Uploading $zip ..."
upload=$(curl -sS -X POST "${auth[@]}" -T "$zip" "$base/upload/v2/$item:upload")
echo "Upload response: $upload"
state=$(jq -r '.uploadState // empty' <<<"$upload")

# Large uploads are processed asynchronously: poll for up to ~5 minutes.
for _ in $(seq 1 30); do
  case "$state" in
    IN_PROGRESS|UPLOAD_IN_PROGRESS) ;;
    *) break ;;
  esac
  sleep 10
  status=$(curl -sS "${auth[@]}" "$base/v2/$item:fetchStatus")
  state=$(jq -r '.lastAsyncUploadState // empty' <<<"$status")
  echo "Upload state: $state"
done

if [ "$state" != "SUCCEEDED" ]; then
  echo "::error::Chrome Web Store upload did not succeed (state: ${state:-none}). A common cause is a version that is not higher than the one already uploaded."
  exit 1
fi

echo "Submitting for review ..."
publish=$(curl -sS -X POST "${auth[@]}" -H "Content-Type: application/json" \
  -d '{"publishType":"DEFAULT_PUBLISH"}' "$base/v2/$item:publish")
echo "Publish response: $publish"
if jq -e '.error' >/dev/null <<<"$publish"; then
  echo "::error::Chrome Web Store publish failed: $(jq -c '.error' <<<"$publish")"
  exit 1
fi

pub_state=$(jq -r '.state // "submitted"' <<<"$publish")
echo "Chrome Web Store: uploaded and submitted (state: $pub_state). It goes live after Google's review." | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
