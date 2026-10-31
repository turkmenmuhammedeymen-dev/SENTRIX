# SENTRIX — Back4App setup

## 1. Create a dedicated Back4App app
Create a new Parse app named SENTRIX. Do not reuse the NEXORA or AETHRION app.

## 2. Configure the browser
Open `public/js/back4app-config.js` and replace the two placeholders with this SENTRIX app's **Application ID** and **JavaScript Key**. These are client keys; never use the Master Key here. The Parse Server URL is already configured.

## 3. Deploy Cloud Code
In Back4App, open Cloud Code and deploy the repository's `cloud/main.js` as the app's main.js. The functions `sentrixHealth`, `sentrixAddAsset`, `sentrixListAssets`, `sentrixDeleteAsset`, and `sentrixCreateAssessmentRequest` should appear after deployment.

## 4. Configure Parse security
Enable email verification if desired, set password policy, review class-level permissions, and disable direct client writes to `SxAssessment` and `SxAuditEvent`. The Cloud Code functions use master-key writes only after validating the logged-in user. Do not expose the Master Key.

## 5. Deploy the website
Deploy the repository root to your static host. Confirm the deployed site serves `/js/back4app-config.js` and `/js/app.js`. Test registration, login, asset registration, asset listing, and logout with a test account.

## Current feature boundary
Asset records and assessment requests are persisted in Back4App. The assessment request endpoint deliberately returns `scannerEnabled: false`; no automated scanner is included. Only register assets you own or have explicit permission to assess.
