# Google Project Fetcher

In order to automate workflows involving container-bound scripts, it is
necessary to acquire the google project id corresponding to a google
apps script. These projects are specifically hidden by Google for some
reason and there is only one way I've found to get it, and that is
through some UI that you can navigate to from google apps script
container. This script automates the UI gestures needed to retreive this
project ID and prints what it finds to STDOUT.

## How to Use

1. Install nodejs v8.4.0 (https://nodejs.org/)
2. Install yarn (https://yarnpkg.com/)
3. `yarn install`
4. SHEET_ID=some-sheet-id GOOGLE_PASSWORD=some-password GOOGLE_USERNAME=some@email.com node run.js
