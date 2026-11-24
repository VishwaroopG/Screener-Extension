# Publishing Ticker Screener

Releasing a new version to the Chrome Web Store and Firefox Add-ons is one command:

```powershell
powershell -ExecutionPolicy Bypass -File .github/scripts/release-extension.ps1 -Bump patch
```

That bumps the version in both manifests, commits and pushes to `main`. The push starts
**Actions → Publish extension**, which:

1. checks that both manifests have the same, higher version,
2. runs the unit tests,
3. builds and minifies both packages and checks them,
4. uploads the Chrome package and submits it for review,
5. submits the Firefox package (with readable source for Mozilla's reviewers) for review.

Both stores still review each version before it goes live. The built zips are attached to
every run as an artifact, so a failed upload can be finished by hand from there.

To only build (no upload), run the workflow by hand with **dry_run** ticked (the default).

## One-time setup

Create a GitHub environment named `extension-stores` (Settings → Environments) and add the
secrets below to it. Optionally add yourself as a *required reviewer* there: every publish
then waits for your click before uploading.

### Chrome Web Store

| Secret | Where to get it |
|---|---|
| `CWS_EXTENSION_ID` | Developer Dashboard → your item → Package tab (32-letter ID) |
| `CWS_PUBLISHER_ID` | Developer Dashboard → Publisher → Settings |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` | Google Cloud console → enable **Chrome Web Store API** → Credentials → OAuth client ID (type *Web application*, redirect URI `https://developers.google.com/oauthplayground`) |
| `CWS_REFRESH_TOKEN` | [OAuth Playground](https://developers.google.com/oauthplayground) → gear icon → "Use your own OAuth credentials" → scope `https://www.googleapis.com/auth/chromewebstore` → authorize with the account that owns the item → *Exchange authorization code for tokens* → copy the refresh token |

Set the OAuth consent screen to **In production** (an app left in *Testing* issues refresh
tokens that expire after 7 days). If a run fails with `invalid_grant`, make a new refresh token.

### Firefox Add-ons

| Secret | Where to get it |
|---|---|
| `AMO_JWT_ISSUER` | [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/) → JWT issuer |
| `AMO_JWT_SECRET` | same page → JWT secret |

The add-on must already be listed on AMO (it is); the workflow submits new versions to it.

Add secrets with the GitHub CLI so they never sit in a file:

```bash
gh secret set CWS_REFRESH_TOKEN --env extension-stores
```

(It prompts for the value.) Repeat for each secret.
